import { writeFileSync } from 'node:fs';

// Docker build argument only. Runtime environment cannot relabel a built image.
const imageTag = process.env.MINGD_IMAGE_TAG || null;
if (process.argv.length !== 3 || (imageTag !== null && !/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(imageTag))) {
  console.error('Expected an output file and a valid Docker image tag.');
  process.exitCode = 1;
} else {
  writeFileSync(process.argv[2], JSON.stringify({ imageTag }, null, 2) + '\n');
}
