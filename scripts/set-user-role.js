import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDatabase } from '../src/db.js';
import { User } from '../src/models.js';
import { normalizeEmail, validEmail } from '../src/auth.js';

const [rawEmail, requestedRole] = process.argv.slice(2);
const email = normalizeEmail(rawEmail);
const role = String(requestedRole || '').trim().toLowerCase();

if (!validEmail(email) || !['admin', 'user'].includes(role)) {
  console.error('Usage: npm run admin:set-role -- member@example.com admin|user');
  process.exitCode = 1;
} else {
  try {
    await connectDatabase();
    const user = await User.findOne({ email });
    if (!user) throw new Error('No Situla user exists for that email. Create the account before assigning a role.');
    if (role === 'user' && user.role === 'admin') {
      const activeAdminCount = await User.countDocuments({ role: 'admin', status: 'active' });
      if (activeAdminCount <= 1) throw new Error('The final active administrator cannot be demoted.');
    }
    if (user.role !== role) {
      user.role = role;
      await user.save();
    }
    console.log('Updated ' + email + ' to role "' + role + '".');
  } catch (error) {
    console.error('Role update failed: ' + (error?.message || 'Unknown error.'));
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}
