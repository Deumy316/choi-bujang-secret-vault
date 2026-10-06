import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import { createLoginVerifier } from '../src/verify-login.mjs';

var require = createRequire(import.meta.url);
var config = require('../aleph.config.json');

var verifyLogin;

function getVerifier() {
    if (!verifyLogin) {
        verifyLogin = createLoginVerifier({
            config: config,
            supabaseSecretKey: process.env.SUPABASE_SECRET_KEY
        });
    }

    return verifyLogin;
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({
            error: 'Method Not Allowed'
        });
    }

    var supabaseUrl = process.env.SUPABASE_URL;
    var supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseSecretKey) {
        return res.status(500).json({
            error: 'Server configuration error'
        });
    }

    var login;

    try {
        login = await getVerifier()(req.headers.authorization);
    } catch (error) {
        console.error('Login verification error:', error);
        return res.status(500).json({
            error: 'Login verification error'
        });
    }

    if (!login) {
        return res.status(401).json({
            error: 'Login required'
        });
    }

    var supabase = createClient(
        supabaseUrl,
        supabaseSecretKey,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
                detectSessionInUrl: false
            }
        }
    );

    var result = await supabase
        .from('notes')
        .select('title, content')
        .order('id', { ascending: true });

    if (result.error) {
        console.error('Supabase error:', result.error);

        return res.status(500).json({
            error: 'Failed to load notes'
        });
    }

    return res.status(200).json({
        notes: result.data
    });
}