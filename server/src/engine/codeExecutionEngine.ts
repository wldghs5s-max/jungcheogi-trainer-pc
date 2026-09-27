import {
  ICodeExecutionEngine,
  CodeExecutionRequest,
  CodeExecutionResult,
  CodeLanguage,
} from "@jungcheogi/shared";
import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

const HOST_EXECUTION_DISABLED_MESSAGE =
  "격리된 코드 실행 환경이 없어 호스트에서 생성 코드를 실행하지 않습니다.";

function unavailable(
  startTime: number,
  language?: string,
): CodeExecutionResult {
  return {
    status: "UNAVAILABLE",
    stdout: "",
    stderr: HOST_EXECUTION_DISABLED_MESSAGE,
    exitCode: null,
    executionTimeMs: Date.now() - startTime,
    errorMessage: language
      ? `${language} 실행 검증 불가: ${HOST_EXECUTION_DISABLED_MESSAGE}`
      : HOST_EXECUTION_DISABLED_MESSAGE,
  };
}

export class LightweightExecutionEngine implements ICodeExecutionEngine {
  private timeoutMs: number;

  constructor(timeoutMs = 2000) {
    this.timeoutMs = timeoutMs;
  }

  public async execute(
    request: CodeExecutionRequest,
  ): Promise<CodeExecutionResult> {
    const startTime = Date.now();
    const timeout = request.timeoutMs || this.timeoutMs;
    const lang = (request.language || "").toUpperCase();

    if (!request.allowHostExecution) {
      return unavailable(startTime, request.language);
    }

    if (lang === "JAVA") {
      return this.executeJava(request.code, timeout, startTime);
    }
    if (lang === "PYTHON") {
      return this.executePython(request.code, timeout, startTime);
    }
    if (lang === "C") {
      return this.executeC(request.code, timeout, startTime);
    }

    return {
      status: "UNSUPPORTED_LANGUAGE",
      stdout: "",
      stderr: `Language ${request.language} execution is not supported`,
      exitCode: null,
      executionTimeMs: Date.now() - startTime,
    };
  }

  private executionEnv(cwd: string): NodeJS.ProcessEnv {
    return {
      PATH: process.env.PATH || "/usr/bin:/bin:/usr/local/bin",
      LANG: "C",
      HOME: cwd,
      TMPDIR: cwd,
    };
  }

  private wrapCSource(code: string): string {
    if (/int\s+main\s*\(/.test(code)) {
      return code;
    }
    return `#include <stdio.h>\n\nint main(void) {\n${code}\n    return 0;\n}\n`;
  }

  private async executeJava(
    code: string,
    timeoutMs: number,
    startTime: number,
  ): Promise<CodeExecutionResult> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "jcg-java-"));
    try {
      const mainClassMatch = code.match(/public\s+class\s+([A-Za-z0-9_]+)/);
      const className = mainClassMatch ? mainClassMatch[1] : "Main";
      const filePath = path.join(tempDir, `${className}.java`);

      let fullCode = code;
      if (!code.includes("class Main") && !mainClassMatch) {
        fullCode = `public class Main {\n${code}\n}`;
      }

      await fs.writeFile(filePath, fullCode, "utf8");

      const compileResult = await this.runCommand(
        "javac",
        ["--release", "8", filePath],
        tempDir,
        timeoutMs,
      ).catch((err) => {
        if (err?.code === "ENOENT") {
          return this.runCommand("javac", [filePath], tempDir, timeoutMs);
        }
        throw err;
      });

      if (compileResult.exitCode !== 0) {
        return {
          status: "COMPILE_ERROR",
          stdout: compileResult.stdout,
          stderr: compileResult.stderr,
          exitCode: compileResult.exitCode,
          executionTimeMs: Date.now() - startTime,
          errorMessage: compileResult.stderr || "Java compilation failed",
        };
      }

      const runResult = await this.runCommand(
        "java",
        ["-cp", tempDir, className],
        tempDir,
        timeoutMs,
      );

      return {
        status: runResult.exitCode === 0 ? "SUCCESS" : "RUNTIME_ERROR",
        stdout: runResult.stdout.trim(),
        stderr: runResult.stderr,
        exitCode: runResult.exitCode,
        executionTimeMs: Date.now() - startTime,
        errorMessage: runResult.exitCode === 0 ? undefined : runResult.stderr,
      };
    } catch (err: any) {
      if (err?.code === "ENOENT") {
        return unavailable(startTime, "JAVA");
      }
      if (String(err?.message || "").includes("timed out")) {
        return {
          status: "TIMEOUT",
          stdout: "",
          stderr: err.message,
          exitCode: null,
          executionTimeMs: Date.now() - startTime,
          errorMessage: err.message,
        };
      }
      return {
        status: "RUNTIME_ERROR",
        stdout: "",
        stderr: err?.message || String(err),
        exitCode: -1,
        executionTimeMs: Date.now() - startTime,
        errorMessage: err?.message || String(err),
      };
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private async executeC(
    code: string,
    timeoutMs: number,
    startTime: number,
  ): Promise<CodeExecutionResult> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "jcg-c-"));
    try {
      const filePath = path.join(tempDir, "main.c");
      const binPath = path.join(tempDir, "prog");
      await fs.writeFile(filePath, this.wrapCSource(code), "utf8");

      const compileResult = await this.runCommand(
        "clang",
        ["-std=c11", "-O0", "-o", binPath, filePath],
        tempDir,
        timeoutMs,
      ).catch((err) => {
        if (err?.code === "ENOENT") {
          return this.runCommand(
            "gcc",
            ["-std=c11", "-O0", "-o", binPath, filePath],
            tempDir,
            timeoutMs,
          );
        }
        throw err;
      });

      if (compileResult.exitCode !== 0) {
        return {
          status: "COMPILE_ERROR",
          stdout: compileResult.stdout,
          stderr: compileResult.stderr,
          exitCode: compileResult.exitCode,
          executionTimeMs: Date.now() - startTime,
          errorMessage: compileResult.stderr || "C compilation failed",
        };
      }

      const runResult = await this.runCommand(binPath, [], tempDir, timeoutMs);
      return {
        status: runResult.exitCode === 0 ? "SUCCESS" : "RUNTIME_ERROR",
        stdout: runResult.stdout.trim(),
        stderr: runResult.stderr,
        exitCode: runResult.exitCode,
        executionTimeMs: Date.now() - startTime,
        errorMessage: runResult.exitCode === 0 ? undefined : runResult.stderr,
      };
    } catch (err: any) {
      if (err?.code === "ENOENT") {
        return unavailable(startTime, "C");
      }
      if (String(err?.message || "").includes("timed out")) {
        return {
          status: "TIMEOUT",
          stdout: "",
          stderr: err.message,
          exitCode: null,
          executionTimeMs: Date.now() - startTime,
          errorMessage: err.message,
        };
      }
      return {
        status: "RUNTIME_ERROR",
        stdout: "",
        stderr: err?.message || String(err),
        exitCode: -1,
        executionTimeMs: Date.now() - startTime,
        errorMessage: err?.message || String(err),
      };
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private async executePython(
    code: string,
    timeoutMs: number,
    startTime: number,
  ): Promise<CodeExecutionResult> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "jcg-py-"));
    try {
      const filePath = path.join(tempDir, "main.py");
      await fs.writeFile(filePath, code, "utf8");
      const res = await this.runCommand(
        "python3",
        [filePath],
        tempDir,
        timeoutMs,
      ).catch((err) => {
        if (err?.code === "ENOENT") {
          return this.runCommand("python", [filePath], tempDir, timeoutMs);
        }
        throw err;
      });
      return {
        status: res.exitCode === 0 ? "SUCCESS" : "RUNTIME_ERROR",
        stdout: res.stdout.trim(),
        stderr: res.stderr,
        exitCode: res.exitCode,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (err: any) {
      if (err?.code === "ENOENT") {
        return unavailable(startTime, "PYTHON");
      }
      if (String(err?.message || "").includes("timed out")) {
        return {
          status: "TIMEOUT",
          stdout: "",
          stderr: err.message,
          exitCode: null,
          executionTimeMs: Date.now() - startTime,
          errorMessage: err.message,
        };
      }
      return {
        status: "RUNTIME_ERROR",
        stdout: "",
        stderr: err?.message || String(err),
        exitCode: -1,
        executionTimeMs: Date.now() - startTime,
      };
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private runCommand(
    cmd: string,
    args: string[],
    cwd: string,
    timeoutMs: number,
  ): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
    return new Promise((resolve, reject) => {
      const child = execFile(
        cmd,
        args,
        {
          cwd,
          timeout: timeoutMs,
          maxBuffer: 1024 * 1024,
          env: this.executionEnv(cwd),
        },
        (error, stdout, stderr) => {
          if (error && (error as NodeJS.ErrnoException).code === "ENOENT") {
            const err = new Error(`Command not found: ${cmd}`) as Error & {
              code: string;
            };
            err.code = "ENOENT";
            return reject(err);
          }
          if (error && (error as any).killed) {
            return reject(new Error("Execution timed out"));
          }
          resolve({
            stdout: stdout ? stdout.toString() : "",
            stderr: stderr ? stderr.toString() : "",
            exitCode: error
              ? typeof error.code === "number"
                ? error.code
                : 1
              : 0,
          });
        },
      );
      child.unref?.();
    });
  }
}

export const defaultExecutionEngine = new LightweightExecutionEngine();

export type EvaluateCodeStatus =
  | "SUCCESS"
  | "ERROR"
  | "SKIPPED"
  | "UNAVAILABLE"
  | "CONFLICT";

export async function evaluateCodeOutput(
  code: string,
  language?: string,
  options?: { allowHostExecution?: boolean },
): Promise<{ status: EvaluateCodeStatus; output?: string; error?: string }> {
  if (!code || !language) {
    return { status: "SKIPPED" };
  }

  try {
    const res = await defaultExecutionEngine.execute({
      code,
      language: language as CodeLanguage,
      allowHostExecution: options?.allowHostExecution === true,
    });

    if (res.status === "SUCCESS") {
      return { status: "SUCCESS", output: res.stdout.trim() };
    }
    if (res.status === "UNAVAILABLE" || res.status === "UNSUPPORTED_LANGUAGE") {
      return {
        status: "UNAVAILABLE",
        error: res.errorMessage || res.stderr,
      };
    }
    return { status: "ERROR", error: res.errorMessage || res.stderr };
  } catch (err: any) {
    return { status: "ERROR", error: err?.message || String(err) };
  }
}
