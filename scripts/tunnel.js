const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CLOUDFLARED_PATH = 'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe';
const TARGET_PORT = 5173;
const ROOT_DIR = path.resolve(__dirname, '..');
const README_PATH = path.join(ROOT_DIR, 'README.md');

console.log('====================================================');
console.log('  [정처기 PC] Cloudflare 터널 실행 & GitHub README 자동 동기화');
console.log('====================================================\n');

if (!fs.existsSync(CLOUDFLARED_PATH)) {
  console.error(`[오류] cloudflared.exe를 찾을 수 없습니다: ${CLOUDFLARED_PATH}`);
  process.exit(1);
}

console.log(`1. Cloudflare 터널 시작 중 (타겟: http://localhost:${TARGET_PORT})...`);

const proc = spawn(CLOUDFLARED_PATH, ['tunnel', '--url', `http://localhost:${TARGET_PORT}`]);

let urlUpdated = false;

function updateReadmeAndPush(tunnelUrl) {
  if (urlUpdated) return;
  urlUpdated = true;

  console.log(`\n====================================================`);
  console.log(`  🌐 새 외부 접속 URL 감지: ${tunnelUrl}`);
  console.log(`====================================================\n`);

  try {
    try {
      console.log('1-1. 원격 최신 변경사항 동기화 (git pull --rebase)...');
      execSync('git pull --rebase origin master', { cwd: ROOT_DIR, stdio: 'inherit' });
    } catch (pullErr) {
      console.warn('[동기화 경고]:', pullErr.message);
    }

    let readme = fs.readFileSync(README_PATH, 'utf8');

    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstDate = new Date(now.getTime() + kstOffset);
    const kstStr = kstDate.toISOString().replace('T', ' ').replace(/\..+/, '') + ' KST';

    const bannerBlock = [
      '<!-- TUNNEL_URL_START -->',
      '> ### 📱 실시간 모바일 / 외부 접속 링크',
      `> **[👉 정처기 학습 플랫폼 바로가기 (클릭)](${tunnelUrl})**  `,
      `> - **실시간 URL**: \`${tunnelUrl}\`  `,
      `> - **마지막 갱신**: ${kstStr}`,
      '<!-- TUNNEL_URL_END -->'
    ].join('\n');

    const startTag = '<!-- TUNNEL_URL_START -->';
    const endTag = '<!-- TUNNEL_URL_END -->';

    if (readme.includes(startTag) && readme.includes(endTag)) {
      const regex = new RegExp(`${startTag}[\\s\\S]*?${endTag}`, 'g');
      readme = readme.replace(regex, bannerBlock);
    } else {
      const lines = readme.split('\n');
      let insertIdx = 0;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('# ')) {
          insertIdx = i + 1;
          break;
        }
      }
      lines.splice(insertIdx, 0, '\n' + bannerBlock + '\n');
      readme = lines.join('\n');
    }

    fs.writeFileSync(README_PATH, readme, 'utf8');
    console.log('2. README.md 최신 접속 URL 업데이트 완료.');

    console.log('3. GitHub에 커밋 및 푸시 중...');
    execSync('git add README.md', { cwd: ROOT_DIR, stdio: 'inherit' });
    execSync(`git commit -m "docs: update live tunnel URL to ${tunnelUrl} [skip ci]"`, {
      cwd: ROOT_DIR,
      stdio: 'inherit',
    });

    try {
      execSync('git push origin master', { cwd: ROOT_DIR, stdio: 'inherit' });
    } catch (pushErr) {
      console.log('원격 변경사항 감지, rebase 후 재시도...');
      execSync('git pull --rebase origin master', { cwd: ROOT_DIR, stdio: 'inherit' });
      execSync('git push origin master', { cwd: ROOT_DIR, stdio: 'inherit' });
    }

    console.log('\n====================================================');
    console.log('  🎉 GitHub 푸시 완료! 모바일에서 GitHub README 접속 시');
    console.log(`  상단 링크(${tunnelUrl})를 바로 누르실 수 있습니다.`);
    console.log('====================================================\n');
  } catch (err) {
    console.error('[README 동기화/푸시 오류]:', err.message);
  }
}

function handleOutput(data) {
  const text = data.toString();
  process.stdout.write(text);

  if (!urlUpdated) {
    const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (match) {
      updateReadmeAndPush(match[0]);
    }
  }
}

proc.stdout.on('data', handleOutput);
proc.stderr.on('data', handleOutput);

proc.on('close', (code) => {
  console.log(`\nCloudflare 터널이 종료되었습니다. (코드: ${code})`);
});
