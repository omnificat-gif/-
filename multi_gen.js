const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const log = (...args) => console.error(...args);

// Run single_gen.js as isolated child process
function runIsolatedGeneration(iteration, totalRuns) {
    return new Promise((resolve) => {
        log(`\n>>> [${iteration}/${totalRuns}] Spawning isolated process...`);
        
        const env = { 
            ...process.env,
            GENERATION_RUN: iteration.toString()
        };
        
        const child = spawn('node', ['single_gen.js'], {
            env,
            stdio: ['ignore', 'pipe', 'pipe'],
            cwd: process.cwd()
        });
        
        let stdout = '';
        let stderr = '';
        
        child.stdout.on('data', (data) => {
            stdout += data.toString();
        });
        
        child.stderr.on('data', (data) => {
            const str = data.toString();
            stderr += str;
            // Print logs in real-time
            process.stderr.write(`[Run ${iteration}] ${str}`);
        });
        
        // Timeout - kill if takes too long
        const timeout = setTimeout(() => {
            log(`>>> [${iteration}] Timeout - killing process`);
            child.kill('SIGKILL');
        }, 120000); // 2 minute timeout per run
        
        child.on('close', (code) => {
            clearTimeout(timeout);
            
            // Kill any leftover chromium processes
            try {
                require('child_process').execSync('pkill -9 -f chromium 2>/dev/null || true', { stdio: 'ignore' });
            } catch (e) {}
            
            if (code === 0) {
                // Token is printed to stdout (last non-empty line)
                const lines = stdout.trim().split('\n').filter(l => l.trim());
                const token = lines[lines.length - 1];
                if (token && token.length > 20) {
                    log(`>>> [${iteration}] SUCCESS - got token`);
                    resolve(token);
                } else {
                    log(`>>> [${iteration}] Completed but no valid token in output`);
                    resolve(null);
                }
            } else {
                log(`>>> [${iteration}] Failed with exit code: ${code}`);
                resolve(null);
            }
        });
        
        child.on('error', (err) => {
            clearTimeout(timeout);
            log(`>>> [${iteration}] Process spawn error:`, err.message);
            resolve(null);
        });
    });
}

// Cleanup any existing chrome processes
function cleanupProcesses() {
    try {
        require('child_process').execSync('pkill -9 -f chromium 2>/dev/null || true', { stdio: 'ignore' });
        require('child_process').execSync('pkill -9 -f chrome 2>/dev/null || true', { stdio: 'ignore' });
    } catch (e) {}
}

(async () => {
    const runs = parseInt(process.env.NUM_RUNS) || 5;
    log(`>>> Multi-generator starting ${runs} isolated runs...`);
    log(`>>> Each run spawns a fresh Node process to avoid connection reuse issues`);
    
    // Ensure tokens directory
    if (!fs.existsSync('tokens')) {
        fs.mkdirSync('tokens', { recursive: true });
    }
    
    // Initial cleanup
    cleanupProcesses();
    
    const tokens = [];
    
    for (let i = 1; i <= runs; i++) {
        // Clean before each run
        cleanupProcesses();
        
        // Wait a bit for cleanup
        await new Promise(r => setTimeout(r, 2000));
        
        const token = await runIsolatedGeneration(i, runs);
        
        if (token) {
            tokens.push(token);
            fs.appendFileSync('tokens/all_tokens.txt', token + '\n');
            
            // Also print to stdout
            console.log(token);
            
            // Send to val.town
            try {
                await fetch("https://gigachadtrey--a1b5c282cb3711f0857d42dde27851f2.web.val.run", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ token, batch_index: i })
                });
                log(`>>> [${i}] Sent to Val Town`);
            } catch (e) {
                log(`>>> [${i}] Val Town send failed (non-critical)`);
            }
        }
        
        // Longer delay between runs for stability
        log(`>>> Waiting 5s before next run...`);
        await new Promise(r => setTimeout(r, 5000));
    }
    
    // Final cleanup
    cleanupProcesses();
    
    log(`\n==========================================`);
    log(`>>> COMPLETE: ${tokens.length}/${runs} tokens generated`);
    log(`>>> Saved to: tokens/all_tokens.txt`);
    log(`==========================================\n`);
    
    if (tokens.length === 0) {
        process.exit(1);
    }
})();
