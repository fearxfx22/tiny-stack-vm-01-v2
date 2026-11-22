import * as fs from "node:fs";
import * as path from "node:path";

const IN_DIR = process.env.MAKEFUN_INPUT_DIR || "/input";
const OUT_DIR = process.env.MAKEFUN_OUTPUT_DIR || "/output";
const MAX_STEPS = 1000000;
const MAX_OUT = 65536;

function run(prog: Buffer, input: Buffer): { out: Buffer; exit: number } {
  const st: number[] = [];
  const cs: number[] = [];
  const mem = new Int32Array(256);
  const out: number[] = [];
  let pc = 0;
  let steps = 0;
  let ip = 0;
  const trap = (c: number): never => { throw c; };
  try {
    for (;;) {
      if (steps >= MAX_STEPS) trap(10);
      if (pc < 0 || pc >= prog.length) trap(9);
      const op = prog[pc];
      let imm: number;
      switch (op) {
        case 0x01: imm = 1; break;
        case 0x02: imm = 4; break;
        case 0x30: case 0x31: case 0x32: case 0x33: imm = 2; break;
        case 0x00: case 0x03: case 0x04: case 0x05: case 0x06: case 0x07:
        case 0x10: case 0x11: case 0x12: case 0x13: case 0x14: case 0x15:
        case 0x16: case 0x17: case 0x18: case 0x19: case 0x1a: case 0x1b:
        case 0x1c: case 0x1d: case 0x1e: case 0x20: case 0x21: case 0x22:
        case 0x34: case 0x40: case 0x41: case 0x50: case 0x51: case 0x52:
        case 0x53: imm = 0; break;
        default: trap(5);
      }
      if (pc + 1 + imm > prog.length) trap(9);
      steps++;
      const nx = pc + 1 + imm;
      switch (op) {
        case 0x00: return { out: Buffer.from(out), exit: 0 };
        case 0x01: {
          if (st.length >= 256) trap(3);
          const b = prog[pc + 1];
          st.push(b < 128 ? b : b - 256);
          pc = nx; break;
        }
        case 0x02: {
          if (st.length >= 256) trap(3);
          st.push(prog[pc + 1] | (prog[pc + 2] << 8) | (prog[pc + 3] << 16) | (prog[pc + 4] << 24));
          pc = nx; break;
        }
        case 0x03: if (st.length < 1) trap(2); st.pop(); pc = nx; break;
        case 0x04: if (st.length < 1) trap(2); if (st.length >= 256) trap(3); st.push(st[st.length - 1]); pc = nx; break;
        case 0x05: if (st.length < 2) trap(2); { const a = st[st.length - 2]; st[st.length - 2] = st[st.length - 1]; st[st.length - 1] = a; } pc = nx; break;
        case 0x06: if (st.length < 2) trap(2); if (st.length >= 256) trap(3); st.push(st[st.length - 2]); pc = nx; break;
        case 0x07: if (st.length < 3) trap(2); { const a = st[st.length - 3]; st[st.length - 3] = st[st.length - 2]; st[st.length - 2] = st[st.length - 1]; st[st.length - 1] = a; } pc = nx; break;
        case 0x10: case 0x11: case 0x12: case 0x13: case 0x14: case 0x15: case 0x16:
        case 0x18: case 0x19: case 0x1a: case 0x20: case 0x21: case 0x22: {
          if (st.length < 2) trap(2);
          const b = st.pop()!;
          const a = st.pop()!;
          const ua = a >>> 0;
          const ub = b >>> 0;
          let r: number;
          switch (op) {
            case 0x10: r = (a + b) | 0; break;
            case 0x11: r = (a - b) | 0; break;
            case 0x12: r = Math.imul(a, b); break;
            case 0x13: if (b === 0) trap(4); r = Math.trunc(a / b) | 0; break;
            case 0x14: if (b === 0) trap(4); r = (a % b) | 0; break;
            case 0x15: if (b === 0) trap(4); r = Math.floor(ua / ub) | 0; break;
            case 0x16: if (b === 0) trap(4); r = (ua % ub) | 0; break;
            case 0x18: r = a & b; break;
            case 0x19: r = a | b; break;
            case 0x1a: r = a ^ b; break;
            case 0x20: r = a === b ? 1 : 0; break;
            case 0x21: r = a < b ? 1 : 0; break;
            default: r = ua < ub ? 1 : 0; break;
          }
          st.push(r);
          pc = nx; break;
        }
        case 0x17: if (st.length < 1) trap(2); st[st.length - 1] = (-st[st.length - 1]) | 0; pc = nx; break;
        case 0x1b: if (st.length < 1) trap(2); st[st.length - 1] = ~st[st.length - 1]; pc = nx; break;
        case 0x1c: case 0x1d: case 0x1e: {
          if (st.length < 2) trap(2);
          const b = st.pop()!;
          const a = st.pop()!;
          st.push(op === 0x1c ? a << (b & 31) : op === 0x1d ? a >> (b & 31) : (a >>> (b & 31)) | 0);
          pc = nx; break;
        }
        case 0x30: { const o = prog[pc + 1] | (prog[pc + 2] << 8); pc = nx + ((o << 16) >> 16); break; }
        case 0x31: if (st.length < 1) trap(2); { const v = st.pop()!; const o = prog[pc + 1] | (prog[pc + 2] << 8); pc = v === 0 ? nx + ((o << 16) >> 16) : nx; break; }
        case 0x32: if (st.length < 1) trap(2); { const v = st.pop()!; const o = prog[pc + 1] | (prog[pc + 2] << 8); pc = v !== 0 ? nx + ((o << 16) >> 16) : nx; break; }
        case 0x33: if (cs.length >= 64) trap(7); cs.push(nx); pc = prog[pc + 1] | (prog[pc + 2] << 8); break;
        case 0x34: if (cs.length === 0) trap(8); pc = cs.pop()!; break;
        case 0x40: if (st.length < 1) trap(2); { const a = st[st.length - 1]; if (a < 0 || a > 255) trap(6); st[st.length - 1] = mem[a]; } pc = nx; break;
        case 0x41: if (st.length < 2) trap(2); { const a = st.pop()!; const v = st.pop()!; if (a < 0 || a > 255) trap(6); mem[a] = v; } pc = nx; break;
        case 0x50: if (st.length < 1) trap(2); { const v = st.pop()!; const s = String(v); if (out.length + s.length > MAX_OUT) trap(11); for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i)); } pc = nx; break;
        case 0x51: if (st.length < 1) trap(2); { const v = st.pop()!; if (out.length + 1 > MAX_OUT) trap(11); out.push(v & 255); } pc = nx; break;
        case 0x52: if (st.length >= 256) trap(3); st.push(ip < input.length ? input[ip++] : -1); pc = nx; break;
        case 0x53: if (st.length < 1) trap(2); { const v = st.pop()!; return { out: Buffer.from(out), exit: v & 255 }; }
      }
    }
  } catch (e) {
    if (typeof e === "number") return { out: Buffer.from(out), exit: e };
    throw e;
  }
}

function main(): void {
  const ids = fs.readdirSync(IN_DIR).sort();
  for (const id of ids) {
    const dir = path.join(IN_DIR, id);
    const pp = path.join(dir, "program.bin");
    if (!fs.existsSync(pp)) continue;
    const prog = fs.readFileSync(pp);
    const ip2 = path.join(dir, "input.bin");
    const input = fs.existsSync(ip2) ? fs.readFileSync(ip2) : Buffer.alloc(0);
    const r = run(prog, input);
    const od = path.join(OUT_DIR, id);
    fs.mkdirSync(od, { recursive: true });
    fs.writeFileSync(path.join(od, "stdout.bin"), r.out);
    fs.writeFileSync(path.join(od, "exit.txt"), r.exit + "\n");
  }
}

main();
