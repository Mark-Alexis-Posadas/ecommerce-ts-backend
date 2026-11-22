import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { createInterface, emitKeypressEvents } from "node:readline";
import type { Key } from "node:readline";
import User from "../models/user.model";

interface Account {
  id: string;
  role?: string;
  passwordHash: string;
}

export interface ResetDependencies {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  findAccounts(email: string): Promise<Account[]>;
  readSecret(label: string): Promise<string>;
  confirm(email: string): Promise<boolean>;
  hash(password: string): Promise<string>;
  updatePassword(account: Account, hash: string): Promise<boolean>;
}

export class PasswordResetError extends Error {}

export function validateAdminPassword(password: string): void {
  if (
    Array.from(password).length < 12 ||
    Buffer.byteLength(password, "utf8") > 72 ||
    !/[a-z]/.test(password) || !/[A-Z]/.test(password) ||
    !/[0-9]/.test(password) || !/[^A-Za-z0-9\s]/.test(password) ||
    /[\x00-\x1f\x7f-\x9f]/.test(password)
  ) {
    throw new PasswordResetError(
      "Use at least 12 characters with uppercase, lowercase, a number and a symbol; maximum 72 UTF-8 bytes. Control characters are not allowed.",
    );
  }
}

/** Raw-mode input deliberately writes neither characters nor masking symbols. */
export function readHiddenPassword(label: string): Promise<string> {
  const input = process.stdin;
  const output = process.stdout;
  if (!input.isTTY || !output.isTTY) {
    return Promise.reject(new PasswordResetError("Run this command in an interactive terminal. Piped password input is not supported."));
  }
  return new Promise((resolve, reject) => {
    let value = "";
    const wasRaw = input.isRaw;
    const wasPaused = input.isPaused();
    const cleanup = () => {
      input.removeListener("keypress", onKey);
      input.removeListener("end", cancel);
      input.removeListener("error", cancel);
      process.removeListener("SIGINT", cancel);
      process.removeListener("SIGTERM", cancel);
      input.setRawMode(wasRaw);
      if (wasPaused) input.pause();
      output.write("\n");
    };
    const cancel = () => {
      value = "";
      cleanup();
      reject(new PasswordResetError("Password reset cancelled. No password was updated."));
    };
    const onKey = (text: string | undefined, key: Key) => {
      if (key.ctrl && (key.name === "c" || key.name === "d")) return cancel();
      if (key.name === "escape") return cancel();
      if (key.name === "return" || key.name === "enter") {
        cleanup();
        resolve(value);
        value = "";
        return;
      }
      if (key.name === "backspace" || key.name === "delete") {
        value = Array.from(value).slice(0, -1).join("");
      } else if (text && !key.ctrl && !key.meta && !/[\x00-\x1f\x7f-\x9f]/.test(text)) {
        value += text;
      }
    };
    emitKeypressEvents(input);
    input.setRawMode(true);
    input.on("keypress", onKey);
    input.once("end", cancel);
    input.once("error", cancel);
    process.once("SIGINT", cancel);
    process.once("SIGTERM", cancel);
    output.write(label);
    input.resume();
  });
}

function confirmUpdate(email: string): Promise<boolean> {
  return new Promise((resolve) => {
    const terminal = createInterface({ input: process.stdin, output: process.stdout });
    terminal.once("SIGINT", () => terminal.close());
    terminal.once("close", () => resolve(false));
    terminal.question(`Reset the password for administrator ${email}? Type RESET to confirm: `, answer => {
      resolve(answer === "RESET");
      terminal.close();
    });
  });
}

export async function persistAdminPassword(account: Account, hash: string): Promise<boolean> {
  const result = await User.updateOne(
    { _id: account.id, role: "admin", password: account.passwordHash },
    { $set: { password: hash } },
    { runValidators: true, timestamps: false },
  );
  return result.matchedCount === 1 && result.modifiedCount === 1;
}

const defaults: ResetDependencies = {
  async connect() {
    if (!process.env.MONGO_URI) throw new PasswordResetError("Database configuration is required.");
    await mongoose.connect(process.env.MONGO_URI, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 5000 });
  },
  async disconnect() { await mongoose.disconnect(); },
  async findAccounts(email) {
    const accounts = await User.find({ email }).select("_id role password").limit(2).lean();
    return accounts.map(account => ({ id: String(account._id), role: account.role, passwordHash: account.password }));
  },
  readSecret: readHiddenPassword,
  confirm: confirmUpdate,
  hash: password => bcrypt.hash(password, 10),
  updatePassword: persistAdminPassword,
};

export async function resetAdminPassword(args: string[], dependencies: ResetDependencies = defaults): Promise<boolean> {
  const email = args[0]?.trim().toLowerCase();
  if (args.length !== 1 || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new PasswordResetError("Usage: resetAdminPassword <account-email>. Passwords must be entered at the hidden prompts, never as arguments.");
  }
  let password = "";
  let confirmation = "";
  try {
    await dependencies.connect();
    const accounts = await dependencies.findAccounts(email);
    if (accounts.length !== 1) throw new PasswordResetError("Exactly one account must match. No password was updated.");
    const account = accounts[0];
    if (account.role !== "admin") throw new PasswordResetError("The target account is not an administrator. No role or password was changed.");
    password = await dependencies.readSecret("New password (hidden): ");
    validateAdminPassword(password);
    confirmation = await dependencies.readSecret("Confirm new password (hidden): ");
    if (password !== confirmation) throw new PasswordResetError("Passwords do not match. No password was updated.");
    if (!await dependencies.confirm(email)) return false;
    const hash = await dependencies.hash(password);
    if (!await dependencies.updatePassword(account, hash)) {
      throw new PasswordResetError("The account changed during reset. No password was updated; verify the account and retry.");
    }
    return true;
  } finally {
    password = "";
    confirmation = "";
    await dependencies.disconnect();
  }
}

if (require.main === module) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error("Run this command in an interactive terminal; piped password input is not supported.");
    process.exitCode = 1;
  } else {
    resetAdminPassword(process.argv.slice(2)).then(updated => {
      console.log(updated ? "Administrator password updated." : "Password reset cancelled. No password was updated.");
    }).catch(error => {
      console.error(error instanceof PasswordResetError ? error.message : "Password reset failed. Verify the database connection and account; credentials are never printed.");
      process.exitCode = 1;
    });
  }
}
