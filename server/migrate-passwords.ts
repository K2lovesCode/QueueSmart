// One-time migration script to hash existing plaintext passwords
import { db } from './db';
import { users } from '@shared/schema';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';

async function migratePasswords() {
  console.log('Starting password migration...');
  
  try {
    // Get all users
    const allUsers = await db.select().from(users);
    
    for (const user of allUsers) {
      // Check if password is already hashed (bcrypt hashes start with $2b$)
      if (user.password.startsWith('$2b$')) {
        console.log(`User ${user.username} already has hashed password, skipping...`);
        continue;
      }
      
      // Hash the plaintext password
      const hashedPassword = await bcrypt.hash(user.password, 12);
      
      // Update the user with hashed password
      await db.update(users)
        .set({ password: hashedPassword })
        .where(eq(users.id, user.id));
        
      console.log(`Migrated password for user: ${user.username}`);
    }
    
    console.log('Password migration completed successfully!');
  } catch (error) {
    console.error('Error during password migration:', error);
    throw error;
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  migratePasswords()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

export { migratePasswords };