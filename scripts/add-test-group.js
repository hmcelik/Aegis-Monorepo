#!/usr/bin/env node

/**
 * Manual script to add a test group to the database
 * Use this if you know the group ID and title but the bot discovery isn't working
 */

import * as db from '../packages/shared/src/services/database.js';
import logger from '../packages/shared/src/services/logger.js';

async function addTestGroup() {
    try {
        // Initialize database
        await db.initializeDatabase();
        console.log('✅ Database initialized');
        
        // Add a test group (replace with actual group details)
        const testGroupId = '-1001234567890'; // Replace with real group ID
        const testGroupTitle = 'Test Telegram Group'; // Replace with real group title
        
        // Check if group already exists
        const existingGroup = await db.getGroup(testGroupId);
        
        if (existingGroup) {
            console.log(`📝 Group already exists: ${existingGroup.chatTitle} (${existingGroup.chatId})`);
        } else {
            // Add the group
            await db.addGroup(testGroupId, testGroupTitle);
            console.log(`✅ Added test group: ${testGroupTitle} (${testGroupId})`);
        }
        
        // Show all groups
        const allGroups = await db.getAllGroups();
        console.log(`\n📊 Total groups in database: ${allGroups.length}`);
        
        if (allGroups.length > 0) {
            console.log('\n📝 All groups:');
            allGroups.forEach((group, index) => {
                console.log(`  ${index + 1}. ${group.chatTitle} (${group.chatId})`);
            });
        }
        
    } catch (error) {
        console.error('❌ Error adding test group:', error);
        throw error;
    }
}

// Run the script
addTestGroup()
    .then(() => {
        console.log('✅ Test group addition completed');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Failed to add test group:', error);
        process.exit(1);
    });
