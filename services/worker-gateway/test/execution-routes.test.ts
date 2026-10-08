import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { buildServer } from "../src/server.js";
import { createWorkerCredential } from "../src/credentials.js";
import { ArtifactValidationError } from "../src/validate-upload.js";
import { UploadCapacityError } from "../src/execution-errors.js";
import type { ExecutionControl } from "../src/execution.js";
const id="00000000-0000-4000-8000-000000000001";
const artifactId="00000000-0000-4000-8000-000000000002";
const hello={protocolVersion:1,release:"0.2.0",recipeVersion:"9",target:"desktop",toolchainSha256:null};
test("assignment routes authenticate, negotiate readiness and preserve draining", async t=>{
 const credential=createWorkerCredential();let ready=false,draining=false,calls=0;
 const execution={accepting:()=>ready,next:async()=>{calls++;return null;},close:async()=>undefined} as unknown as ExecutionControl;
 const server=buildServer({logger:false,execution,workers:{heartbeat:async()=>({outcome:"ok",receipt:{protocolVersion:1,workerId:credential.workerId,receivedAt:new Date().toISOString(),heartbeatIntervalMs:10000,draining,acceptingAssignments:ready}})}});
 t.after(()=>server.close());const request={method:"POST" as const,url:"/v1/assignments/next",payload:{hello},headers:{authorization:`Bearer ${credential.credential}`}};
 assert.equal((await server.inject({...request,headers:{}})).statusCode,401);
 assert.equal((await server.inject({...request,payload:{hello,commands:["bad"]}})).statusCode,400);
 assert.equal((await server.inject(request)).statusCode,503);
 ready=true;draining=true;assert.equal((await server.inject(request)).statusCode,200);assert.equal(calls,0);
 draining=false;assert.equal((await server.inject(request)).json().assignment,null);assert.equal(calls,1);
 assert.equal((await server.inject("/healthz")).json().acceptingAssignments,true);
});

test("publication capacity produces a retryable response and clears the transfer idle timeout", async t => {
 const directory=await mkdtemp("/tmp/mingd-route-retry-");t.after(()=>rm(directory,{recursive:true,force:true}));
 const credential=createWorkerCredential();let capacity=true;const timeouts:number[]=[];
 const execution={accepting:()=>true,close:async()=>undefined,authorizeUpload:async()=>({}),
 complete:async()=>{assert.equal(timeouts.at(-1),0);if(capacity)throw new UploadCapacityError();return artifactId;}} as unknown as ExecutionControl;
 const server=buildServer({logger:false,execution,workDir:directory,workers:{heartbeat:async()=>({outcome:"unauthorized"})}});t.after(()=>server.close());
 server.addHook("onRequest",async request=>{request.raw.setTimeout=((value:number)=>{timeouts.push(value);return request.raw;}) as typeof request.raw.setTimeout;});
 const payload=Buffer.from("upload fixture");const request={method:"PUT" as const,url:`/v1/assignments/${id}/artifact`,payload,
 headers:{authorization:`Bearer ${credential.credential}`,"content-type":"application/octet-stream","content-length":String(payload.length),"x-artifact-sha256":createHash("sha256").update(payload).digest("hex")}};
 const busy=await server.inject(request);
 assert.equal(busy.statusCode,429);assert.equal(busy.headers["retry-after"],"10");assert.deepEqual(busy.json(),{error:"upload_capacity"});
 assert.deepEqual(timeouts,[30000,0]);
 capacity=false;assert.equal((await server.inject(request)).json().artifactId,artifactId);
 assert.deepEqual(await readdir(directory),[]);
});
test("uploads validate ownership, media type, bounds and digest before completion", async t=>{
 const directory=await mkdtemp("/tmp/mingd-route-test-");t.after(()=>rm(directory,{recursive:true,force:true}));
 const credential=createWorkerCredential();let owned=true,committed=false,invalid=false,calls=0;
 const execution={accepting:()=>true,close:async()=>undefined,authorizeUpload:async()=>owned?(committed?{artifactId}:{}):null,
 complete:async()=>{calls++;if(invalid)throw new ArtifactValidationError();return artifactId;}} as unknown as ExecutionControl;
 const server=buildServer({logger:false,execution,workDir:directory,maxUploads:1,workers:{heartbeat:async()=>({outcome:"unauthorized"})}});t.after(()=>server.close());
 const payload=Buffer.from("test upload");const headers={authorization:`Bearer ${credential.credential}`,"content-type":"application/octet-stream","content-length":String(payload.length),"x-artifact-sha256":createHash("sha256").update(payload).digest("hex")};
 const request={method:"PUT" as const,url:`/v1/assignments/${id}/artifact`,headers,payload};
 assert.equal((await server.inject({...request,headers:{...headers,authorization:"wrong"}})).statusCode,401);
 owned=false;assert.equal((await server.inject(request)).statusCode,410);assert.equal(calls,0);owned=true;
 assert.equal((await server.inject({...request,headers:{...headers,"content-type":"application/json"}})).statusCode,415);
 assert.equal((await server.inject({...request,headers:{...headers,"content-length":"536870913"}})).statusCode,413);
 assert.equal((await server.inject({...request,headers:{...headers,"x-artifact-sha256":"a".repeat(64)}})).statusCode,400);assert.equal(calls,0);
 invalid=true;assert.equal((await server.inject(request)).statusCode,422);invalid=false;
 assert.equal((await server.inject(request)).json().artifactId,artifactId);assert.equal(calls,2);
 committed=true;assert.equal((await server.inject(request)).json().artifactId,artifactId);assert.equal(calls,2);
 assert.deepEqual(await readdir(directory),[]);
});
