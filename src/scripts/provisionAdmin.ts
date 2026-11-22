import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/user.model';
export async function provisionAdmin(args: string[]): Promise<void> {
  const email = args[0]?.trim().toLowerCase();
  const mode = args[1];
  if (
    !email ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    args.length !== 2 ||
    !['--dry-run', '--approve-role-change'].includes(mode)
  )
    throw new Error('Usage: provisionAdmin <email> --dry-run|--approve-role-change');
  if (!process.env.MONGO_URI) throw new Error('Database configuration required');
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      autoIndex: false,
      serverSelectionTimeoutMS: 5000,
    });
    const users = await User.find({ email }).limit(2);
    if (users.length !== 1)
      throw new Error(
        'Exactly one normalized account must exist; register first or resolve duplicates with approval',
      );
    const user = users[0];
    if (mode === '--dry-run') {
      console.log(
        'Account found. Current role: ' +
          (user.role === 'admin' ? 'admin' : 'customer') +
          '. No changes written.',
      );
      return;
    }
    if (user.role !== 'admin') {
      user.role = 'admin';
      await user.save();
    }
    console.log('Admin role provisioned');
  } finally {
    await mongoose.disconnect();
  }
}
if (require.main === module)
  provisionAdmin(process.argv.slice(2)).catch((error) => {
    console.error(
      error instanceof Error &&
        (error.message.startsWith('Usage:') || error.message.startsWith('Exactly one'))
        ? error.message
        : 'Provisioning failed; verify database configuration and account. No credentials are printed.',
    );
    process.exitCode = 1;
  });
