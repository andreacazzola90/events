const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://yrfgjbzwdgehjinbbpej.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_SECRET_KEY;

const supabaseServer = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function checkTables() {
    // Try different possible table names
    const tableNames = ['events', 'users', 'favorites', 'Event', 'User', 'Favorite'];

    for (const tableName of tableNames) {
        try {
            const { data, error } = await supabaseServer.from(tableName).select('*').limit(1);
            if (!error) {
                console.log(`✓ Table '${tableName}' exists, found ${data?.length || 0} records`);
            } else {
                console.log(`✗ Table '${tableName}' error:`, error.message);
            }
        } catch (e) {
            console.log(`✗ Table '${tableName}' failed:`, e.message);
        }
    }
}

checkTables().catch(console.error);