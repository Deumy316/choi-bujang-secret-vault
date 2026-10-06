import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { deploymentIdentity } from './deployment-identity.mjs';

const root = resolve(import.meta.dirname, '..');
const publicDir = resolve(root, 'public');

const config = JSON.parse(
  await readFile(resolve(root, 'aleph.config.json'), 'utf8')
);

await mkdir(publicDir, { recursive: true });

if (!process.argv.includes('--local')) {
  const identity = deploymentIdentity(process.env, config);

  await writeFile(
    resolve(publicDir, 'aleph.json'),
    `${JSON.stringify(identity, null, 2)}\n`,
    'utf8'
  );

  console.log('배포 저장소·커밋·주소를 public/aleph.json에 기록했습니다.');
}

console.log('2단계: 공개 data.json 복사 없이 보호된 자료 API를 사용합니다.');