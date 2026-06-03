const { supabase, supabaseAdmin } = require('../config/supabase');

// Middleware to load user session if it exists (does not block access)
async function loadUser(req, res, next) {
  res.locals.user = null;
  req.user = null;

  const accessToken = req.session?.accessToken;

  if (accessToken) {
    try {
      // Validate the token with Supabase Auth
      const { data: { user }, error } = await supabase.auth.getUser(accessToken);

      if (error || !user) {
        // Token might have expired, clear it
        req.session.accessToken = null;
        req.session.user = null;
        return next();
      }

      // Fetch additional user details (like role) from public.users
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError || !profile) {
        console.error('Profile not found for authenticated user:', profileError);
        // Fallback to basic auth user info
        req.user = {
          id: user.id,
          email: user.email,
          full_name: user.user_metadata?.full_name || '',
          phone: user.user_metadata?.phone || '',
          role: 'customer' // default
        };
      } else {
        req.user = profile;
      }

      res.locals.user = req.user;
    } catch (err) {
      console.error('Error in loadUser middleware:', err);
    }
  }

  next();
}

// Middleware to block access if user is not authenticated
function requireAuth(req, res, next) {
  if (!req.user) {
    req.session.redirectTo = req.originalUrl;
    return res.redirect('/auth/login');
  }
  next();
}

module.exports = {
  loadUser,
  requireAuth
};
