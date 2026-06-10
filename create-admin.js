require('dotenv').config();
const { supabaseAdmin } = require('./config/supabase');

async function createAdminUser() {
  try {
    console.log('Creating admin user...\n');

    // 1. Create user in auth.users
    const adminEmail = 'admin@electrotech.com';
    const adminPassword = 'Admin123456';

    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      user_metadata: {
        full_name: 'Admin ElectroTech',
        phone: '081234567890',
        role: 'admin'
      },
      email_confirm: true
    });

    if (authError) {
      console.error('❌ Error creating auth user:', authError.message);
      return;
    }

    console.log('✅ Auth user created:', authUser.user.id);

    // 2. Update role in public.users to admin
    const { data: updateData, error: updateError } = await supabaseAdmin
      .from('users')
      .update({ role: 'admin' })
      .eq('id', authUser.user.id)
      .select();

    if (updateError) {
      console.error('❌ Error updating user role:', updateError.message);
      return;
    }

    console.log('✅ User role updated to admin\n');
    console.log('========================================');
    console.log('Admin Account Created Successfully!');
    console.log('========================================');
    console.log(`Email: ${adminEmail}`);
    console.log(`Password: ${adminPassword}`);
    console.log(`ID: ${authUser.user.id}`);
    console.log('\n📝 Catatan: Ubah password segera setelah login pertama!');
    console.log('🔐 Jangan share credentials ini ke siapa pun.\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
    process.exit(1);
  }
}

createAdminUser();
