import "dotenv/config";
import mongoose from "mongoose";
import User from "../models/user.model";
async function main() {
 const email = process.argv[2]?.trim().toLowerCase();
 if (!email || process.argv[3] !== "--approve-role-change") throw new Error("Explicit role change approval required");
 if (!process.env.MONGO_URI) throw new Error("Database configuration required");
 await mongoose.connect(process.env.MONGO_URI);
 const user = await User.findOne({ email });
 if (!user) throw new Error("Register the customer first");
 user.role = "admin"; await user.save(); console.log("Admin role provisioned");
}
main().catch(() => { console.error("Provisioning failed; verify arguments, account and configuration"); process.exitCode = 1; }).finally(() => mongoose.disconnect());
