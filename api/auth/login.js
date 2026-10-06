import { createClient } from '@supabase/supabase-js';

function getSupabase() {
    return createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SECRET_KEY,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
                detectSessionInUrl: false
            }
        }
    );
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');

        return res.status(405).json({
            error: 'Method Not Allowed'
        });
    }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
        return res.status(500).json({
            error: 'Server configuration error'
        });
    }

    var body = req.body || {};

    if (
        typeof body.email !== 'string' ||
        !body.email.trim() ||
        typeof body.password !== 'string' ||
        !body.password
    ) {
        return res.status(400).json({
            error: 'Email and password are required'
        });
    }

    var supabase = getSupabase();

    var result = await supabase.auth.signInWithPassword({
        email: body.email.trim(),
        password: body.password
    });

    if (
        result.error ||
        !result.data ||
        !result.data.session ||
        !result.data.session.access_token ||
        !result.data.user
    ) {
        return res.status(401).json({
            error: 'Login failed'
        });
    }

    return res.status(200).json({
        access_token: result.data.session.access_token,
        user: {
            email: result.data.user.email
        }
    });
}