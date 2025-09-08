#!/usr/bin/env node

/**
 * Utility script to populate the groups table with groups the bot currently has access to
 * This fixes the issue where groups aren't showing up in the API because they weren't
 * registered when the bot was first added to them.
 */

import * as db from '../packages/shared/src/services/database.js';
import logger from '../packages/shared/src/services/logger.js';

// Simple manual group registration since we can't easily discover groups
const KNOWN_GROUPS = [
  // Add your actual group IDs and titles here
  // Example: { id: '-1001234567890', title: 'My Test Group' },
];

console.log('💡 This script can register known groups manually.');
console.log('To discover groups automatically, the bot would need recent message activity.');
console.log('For now, you can add groups manually using the /register command in each group.');

async function registerKnownGroups() {
  console.log('🔍 Starting manual group registration...');

  try {
    // Initialize database
    await db.initializeDatabase();
    console.log('✅ Database initialized');

    // Get current groups in database
    const existingGroups = await db.getAllGroups();
    console.log(`📊 Current groups in database: ${existingGroups.length}`);

    if (existingGroups.length > 0) {
      console.log('📝 Existing groups:');
      existingGroups.forEach(group => {
        console.log(`  - ${group.chatTitle} (${group.chatId})`);
      });
    }

    // Register known groups
    let newGroupsCount = 0;

    if (KNOWN_GROUPS.length === 0) {
      console.log('\n� No groups defined in KNOWN_GROUPS array.');
      console.log('To add groups manually:');
      console.log('  1. Add the bot to a Telegram group as admin');
      console.log('  2. In the group, send: /register');
      console.log('  3. Or edit this script to add group IDs to KNOWN_GROUPS');
    } else {
      for (const knownGroup of KNOWN_GROUPS) {
        const existingGroup = await db.getGroup(knownGroup.id);

        if (!existingGroup) {
          await db.addGroup(knownGroup.id, knownGroup.title);
          console.log(`✅ Added group: ${knownGroup.title} (${knownGroup.id})`);
          newGroupsCount++;
        } else {
          console.log(`📝 Group already registered: ${existingGroup.chatTitle} (${knownGroup.id})`);
        }
      }
    }

    console.log(`\n📊 Registration Summary:`);
    console.log(`  - Known groups: ${KNOWN_GROUPS.length}`);
    console.log(`  - New groups added: ${newGroupsCount}`);

    // Final count
    const finalGroups = await db.getAllGroups();
    console.log(`\n🎉 Final result: ${finalGroups.length} groups in database`);

    if (finalGroups.length > 0) {
      console.log('\n📝 All registered groups:');
      finalGroups.forEach((group, index) => {
        console.log(`  ${index + 1}. ${group.chatTitle} (${group.chatId})`);
      });
    }
  } catch (error) {
    console.error('❌ Error during group registration:', error);
    throw error;
  }
}

// Handle cleanup
async function cleanup() {
  try {
    process.exit(0);
  } catch (error) {
    console.error('Error during cleanup:', error);
    process.exit(1);
  }
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// Run the script
registerKnownGroups()
  .then(() => {
    console.log('✅ Group registration completed successfully');
    cleanup();
  })
  .catch(error => {
    console.error('❌ Group registration failed:', error);
    process.exit(1);
  });
