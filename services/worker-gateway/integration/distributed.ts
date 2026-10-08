/** Disposable local acceptance test: real HTTPS, two isolated worker processes,
 * private Redis/Supabase, streamed uploads, cache reuse and expired delivery.
 * Requires local Supabase and an explicitly selected disposable Redis database.
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile, copyFile, cp } from "node:fs/promises";
import { join } from "node:path";
import { createServer as tlsServer } from "node:https";
import { request as httpRequest } from "node:http";
import { once } from "node:events";
import { setTimeout as pause } from "node:timers/promises";
import { Queue } from "bullmq";
import { BUILD_RECIPE_VERSION, DEFAULT_BUILD_CONFIG, canonicalBuildCacheInput, normalizeBuildConfig, resolveGodotVersion } from "@mingd/build-config";
import { createGatewayDatabase } from "../src/backend.js";
import { WorkerOperator } from "../src/operator.js";
import { WorkerStore } from "../src/workers.js";
import { ExecutionBroker, redisConnection } from "../src/execution.js";
import { buildServer } from "../src/server.js";
import { RemoteClient } from "../../builder/src/remote-client.js";

const redisUrl = process.env.MINGD_INTEGRATION_REDIS_URL;
assert.ok(redisUrl, "Set MINGD_INTEGRATION_REDIS_URL to disposable local Redis.");
assert.ok(["127.0.0.1", "localhost"].includes(new URL(redisUrl).hostname));
const status = spawnSync("npx",["--yes","supabase@2.119.0","status","-o","json"],{encoding:"utf8"});
assert.equal(status.status,0,"Local Supabase must be running.");
const local = JSON.parse(status.stdout);
assert.equal(new URL(local.API_URL).hostname,"127.0.0.1");
const db = createGatewayDatabase({ SUPABASE_URL:local.API_URL, SUPABASE_SECRET_KEY:local.SERVICE_ROLE_KEY });
const storage = createGatewayDatabase({ SUPABASE_URL:local.API_URL, SUPABASE_SECRET_KEY:local.SERVICE_ROLE_KEY },120_000);
const directory = await mkdtemp("/tmp/mingd-distributed-");
const release = JSON.parse(await readFile(new URL("../package.json",import.meta.url),"utf8")).version;
const runId = randomUUID(); const queues = {desktop:`integration-${runId}-desktop`,web:`integration-${runId}-web`,android:`integration-${runId}-android`,macos:`integration-${runId}-macos`};
const brokerOptions={release:`${release}-gateway-fixture`,redisUrl,queues,concurrency:4,dryRun:true,artifactBucket:"build-artifacts",maxUploads:2,workDir:join(directory,"uploads"),toolchainSha256:null,maxJobMs:120_000};
let broker = new ExecutionBroker(db,storage,brokerOptions);
let gateway = buildServer({logger:false,workers:new WorkerStore(db,brokerOptions.release,BUILD_RECIPE_VERSION,()=>broker.accepting()),execution:broker,workDir:join(directory,"uploads"),maxUploads:2});
const queue = new Queue(queues.desktop,{connection:redisConnection(redisUrl)});
const operator = new WorkerOperator(db);
const hello = {protocolVersion:1 as const,release,recipeVersion:BUILD_RECIPE_VERSION,target:"desktop" as const,toolchainSha256:null};
const workerImage=process.env.MINGD_INTEGRATION_WORKER_IMAGE;
const workers: ReturnType<typeof spawn>[]=[]; const enrollments: Awaited<ReturnType<typeof operator.enroll>>[]=[];
const buildIds: string[]=[]; const artifactIds=new Set<string>(); const output: string[]=[];
let userId: string | undefined;
let proxy: ReturnType<typeof tlsServer> | undefined;
async function check<T>(query: PromiseLike<{data:T;error:unknown}>) {const result=await query;assert.equal(result.error,null);return result.data as NonNullable<T>;}
async function until<T>(fn:()=>Promise<T|undefined>,ms=120_000): Promise<T> {
 const deadline=Date.now()+ms;
 while(Date.now()<deadline){if(workers.some(worker=>worker.exitCode!==null&&worker.exitCode!==0))throw new Error("Worker exited: "+output.join("\n"));const result=await fn();if(result!==undefined)return result;await pause(250);}
 throw new Error("Acceptance timed out: "+output.join("\n"));
}
async function enqueue(kind: "release"|"debug", configOverride={}, missingDelivery=false) {
 const config=normalizeBuildConfig({...DEFAULT_BUILD_CONFIG,godotVersion:"4.6.3",templateKinds:[kind],...configOverride});
 const source=await resolveGodotVersion(config.godotVersion);
 const hash=createHash("sha256").update(canonicalBuildCacheInput(config,source)).digest("hex");
 if(buildIds.length<2){
  const artifactHash=createHash("sha256").update(`dry-run\n${hash}`).digest("hex");
  const existing=await check(db.from("artifacts").select("id,storage_path").eq("config_hash",artifactHash).maybeSingle());
  if(existing){
   const references=await check(db.from("builds").select("id").eq("artifact_id",existing.id));
   assert.equal(references.length,0,"Use a disposable local database without existing builds for these acceptance recipes.");
   await storage.storage.from("build-artifacts").remove([existing.storage_path]);await check(db.from("artifacts").delete().eq("id",existing.id));
  }
 }
 const id=randomUUID();buildIds.push(id);
 await check(db.from("builds").insert({id,user_id:userId,config_hash:hash,config,...(missingDelivery?{created_at:new Date(Date.now()-31_000).toISOString()}: {})}));
 if(!missingDelivery)await queue.add("compile-template",{buildId:id,userId,configHash:hash,config},{jobId:id,attempts:2,backoff:500});
 return {id,config,source};
}
try {
 const created=await db.auth.admin.createUser({email:`worker-${runId}@example.com`,password:randomUUID(),email_confirm:true});
 assert.equal(created.error,null);userId=created.data.user!.id;
 for(let index=0;index<2;index++){const enrollment=await operator.enroll(`Integration ${runId} ${index}`,{...hello,release:"0.2.0"});await operator.saveEnrollment(enrollment);enrollments.push(enrollment);}
 const cert=join(directory,"cert.pem"),key=join(directory,"key.pem");
 const certResult=spawnSync("openssl",["req","-x509","-newkey","rsa:2048","-nodes","-keyout",key,"-out",cert,"-days","1","-subj","/CN=localhost","-addext","subjectAltName=DNS:localhost,IP:127.0.0.1"],{stdio:"ignore"});assert.equal(certResult.status,0);
 await broker.start();await gateway.listen({host:"127.0.0.1",port:0});
 const address=gateway.server.address();assert.ok(address&&typeof address!=="string");
 proxy=tlsServer({key:await readFile(key),cert:await readFile(cert)},(request,response)=>{
  const upstream=httpRequest({host:"127.0.0.1",port:address.port,path:request.url,method:request.method,headers:request.headers},received=>{response.writeHead(received.statusCode!,received.headers);received.pipe(response);});
  upstream.on("error",()=>{response.writeHead(502);response.end();});request.pipe(upstream);
 });proxy.listen(0,"127.0.0.1");await once(proxy,"listening");const tlsAddress=proxy.address();assert.ok(tlsAddress&&typeof tlsAddress!=="string");
 const origin=`https://localhost:${tlsAddress.port}`;
 // The test proxy has an ephemeral local CA. Production uses normal public trust.
 const testTransport: typeof fetch=async(input,init)=>{
  const target=new URL(String(input));assert.equal(target.origin,origin);
  return fetch(`http://127.0.0.1:${address.port}${target.pathname}`,init);
 };
 const client=new RemoteClient(origin,enrollments[0].credential,testTransport);
 const first=await enqueue("release"), second=await enqueue("debug",{},true);
 for(let index=0;index<2;index++){
  const work=join(directory,`work-${index}`),cache=join(directory,`source-${index}`);await mkdir(work);
  for(const build of [first,second]){const sourceDir=join(cache,build.source.id,build.source.sourceSha256,"source");await mkdir(sourceDir,{recursive:true});await writeFile(join(sourceDir,"SConstruct"),"# dry-run fixture; compiler never executes this file\n");}
  const token=join(directory,`worker-${index}.token`);await writeFile(token,enrollments[index].credential,{mode:0o600});
  const environment={PATH:process.env.PATH,NODE_EXTRA_CA_CERTS:cert,BUILDER_MODE:"remote",BUILDER_TARGET:"desktop",WORKER_GATEWAY_URL:origin,WORKER_TOKEN_FILE:token,GODOT_WORK_DIR:work,GODOT_CACHE_DIR:cache,CCACHE_DIR:join(directory,`ccache-${index}`)};
  const dockerArgs=["run","--rm","--name",`mingd-acceptance-${runId}-${index}`,"--network","host","--cap-drop","ALL","--cap-add","CHOWN","--cap-add","DAC_OVERRIDE","--cap-add","FOWNER","--security-opt","no-new-privileges:true","--cpus","2","--memory","2g","--pids-limit","512"];
  for(const [key,value] of Object.entries(environment))if(key!=="PATH"&&value)dockerArgs.push("-e",`${key}=${value.replace(directory,"/test")}`);
  if(workerImage){
    const staging=join(directory,`container-${index}`);await mkdir(staging);
    await copyFile(cert,join(staging,"cert.pem"));await copyFile(token,join(staging,`worker-${index}.token`));
    await cp(cache,join(staging,`source-${index}`),{recursive:true});await mkdir(join(staging,`work-${index}`));
    const created=spawnSync("docker",["create",...dockerArgs.slice(1),workerImage],{encoding:"utf8"});assert.equal(created.status,0,created.stderr);
    const copied=spawnSync("docker",["cp",`${staging}/.`,`mingd-acceptance-${runId}-${index}:/test`],{encoding:"utf8"});assert.equal(copied.status,0,copied.stderr);
  }
  const worker=workerImage ? spawn("docker",["start","--attach",`mingd-acceptance-${runId}-${index}`],{stdio:["ignore","pipe","pipe"]})
    : spawn(process.execPath,["--import","tsx","services/builder/src/remote.ts"],{env:environment,stdio:["ignore","pipe","pipe"]});
  worker.stdout?.on("data",chunk=>output.push(chunk.toString()));worker.stderr?.on("data",chunk=>output.push(chunk.toString()));workers.push(worker);
 }
 for(const build of [first,second]){
  const completed=await until(async()=>{const row=await check(db.from("builds").select("status,artifact_id,performance_metrics,heartbeat_at").eq("id",build.id).single());assert.notEqual(row.status,"failed","Build failed: "+output.join("\n"));return row.status==="complete"?row:undefined;});
  assert.ok(completed.heartbeat_at);assert.ok(completed.performance_metrics?.stageDurationsMs.uploading>=0);artifactIds.add(completed.artifact_id);
  const artifact=await check(db.from("artifacts").select("storage_path,sha256,size_bytes,is_dry_run").eq("id",completed.artifact_id).single());
  assert.equal(artifact.is_dry_run,true);const file=await check(storage.storage.from("build-artifacts").download(artifact.storage_path));
  const bytes=Buffer.from(await file.arrayBuffer());assert.equal(createHash("sha256").update(bytes).digest("hex"),artifact.sha256);assert.equal(bytes.length,artifact.size_bytes);
 }
 for(const enrollment of enrollments){const observed=await check(db.from("build_workers").select("credential_hash,software_release").eq("id",enrollment.workerId).single());assert.equal(observed.credential_hash,enrollment.credentialHash);assert.equal(observed.software_release,release);}
 const reused=await enqueue("release");const cached=await until(async()=>{const row=await check(db.from("builds").select("status,artifact_id,performance_metrics").eq("id",reused.id).single());return row.status==="complete"?row:undefined;});assert.equal(cached.performance_metrics.artifactCacheHit,true);
 // Idle workers keep cache/container snapshots fresh without active builds.
 const firstSnapshots = new Map<string,string>();
 for(const enrollment of enrollments){
  const observed=await until(async()=>{const row=await check(db.from("build_workers").select("telemetry,telemetry_at").eq("id",enrollment.workerId).single());return row.telemetry_at?row:undefined;});
  assert.equal(observed.telemetry.schemaVersion,1);
  if(workerImage){assert.ok(observed.telemetry.ccache);assert.ok(observed.telemetry.container);}
  firstSnapshots.set(enrollment.workerId,observed.telemetry_at);
 }
 for(const enrollment of enrollments){
  const observed=await until(async()=>{const row=await check(db.from("build_workers").select("telemetry,telemetry_at").eq("id",enrollment.workerId).single());return row.telemetry_at>firstSnapshots.get(enrollment.workerId)!?row:undefined;},45_000);
  if(workerImage)assert.equal(typeof observed.telemetry.container.cpuCoresUsed,"number");
 }
 const adminStats=await check(db.rpc("admin_worker_stats",{p_limit:100,p_offset:0}));
 for(const enrollment of enrollments){const row=adminStats.workers.find((worker: {id:string})=>worker.id===enrollment.workerId);assert.ok(row);assert.ok(row.telemetryAt);assert.equal(row.activeBuilds.length,0);assert.ok(row.latestBuild);assert.equal(JSON.stringify(row).includes(enrollment.credentialHash),false);}
 // Stop both workers. Test manual delivery fencing and retry ownership.
 if(workerImage)for(let index=0;index<workers.length;index++)spawnSync("docker",["stop","-t","15",`mingd-acceptance-${runId}-${index}`],{stdio:"ignore"});
 else for(const worker of workers)worker.kill("SIGTERM");await Promise.all(workers.map(worker=>worker.exitCode!==null?Promise.resolve():once(worker,"exit")));
 const interrupted=await enqueue("release",{optimization:"size_extra"});
 const assignment=await until(async()=>await client.next(hello)??undefined);assert.equal(assignment.buildId,interrupted.id);
 await check(db.from("worker_assignments").update({lease_until:new Date(Date.now()-1000).toISOString()}).eq("id",assignment.assignmentId));
 await assert.rejects(client.heartbeat({protocolVersion:1,assignmentId:assignment.assignmentId,stage:"compiling",logTail:null,lastOutputAt:null,outputBytes:0}));
 const replacement=await until(async()=>{const next=await client.next(hello);return next&&next.assignmentId!==assignment.assignmentId?next:undefined;},30_000);
 assert.equal(replacement.buildId,assignment.buildId);
 // Graceful gateway restart must durably invalidate the in-flight attempt.
 await gateway.close();
 broker=new ExecutionBroker(db,storage,brokerOptions);
 gateway=buildServer({logger:false,workers:new WorkerStore(db,brokerOptions.release,BUILD_RECIPE_VERSION,()=>broker.accepting()),execution:broker,workDir:join(directory,"uploads"),maxUploads:2});
 await broker.start();await gateway.listen({host:"127.0.0.1",port:address.port});
 await assert.rejects(client.status(replacement.assignmentId));
 // The restarted delivery had exhausted its two attempts; it must stay failed.
 await until(async()=>{const row=await check(db.from("builds").select("status").eq("id",interrupted.id).single());return row.status==="failed"?true:undefined;},30_000);
 await operator.setState(enrollments[0].workerId,"revoke");await assert.rejects(client.next(hello));
 console.log("Distributed acceptance passed: real HTTPS, two credential-only worker processes, queue dispatch, stages/leases, streamed private artifacts, checksum verification, cache reuse, missing-delivery reconciliation, expiry/replacement, gateway restart, revocation, idle telemetry and credential-free admin statistics.");
} finally {
 if(workerImage)for(let index=0;index<workers.length;index++)spawnSync("docker",["rm","-f",`mingd-acceptance-${runId}-${index}`],{stdio:"ignore"});
 for(const worker of workers)if(worker.exitCode===null)worker.kill("SIGKILL");
 await gateway.close();if(proxy)await new Promise<void>(resolve=>proxy!.close(()=>resolve()));
 await queue.obliterate({force:true}).catch(()=>undefined);await queue.close();
 if(buildIds.length){const builds=await db.from("builds").select("artifact_id").in("id",buildIds);for(const build of builds.data??[])if(build.artifact_id)artifactIds.add(build.artifact_id);}
 for(const id of artifactIds){const artifact=await db.from("artifacts").select("storage_path").eq("id",id).single();if(artifact.data)await storage.storage.from("build-artifacts").remove([artifact.data.storage_path]);}
 if(userId)await db.auth.admin.deleteUser(userId);
 if(artifactIds.size)await db.from("artifacts").delete().in("id",[...artifactIds]);
 if(enrollments.length)await db.from("build_workers").delete().in("id",enrollments.map(value=>value.workerId));
 await rm(directory,{recursive:true,force:true});
}
