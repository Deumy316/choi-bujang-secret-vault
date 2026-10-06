import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
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
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
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

    var supabase = getSupabase();

    if (req.method === 'GET') {
        var result = await supabase
            .from('notes')
            .select('note_id, title, content, owner_id')
            .order('id', { ascending: true });

        if (result.error) {
            console.error('Supabase error:', result.error);

            return res.status(500).json({
                error: 'Failed to load notes'
            });
        }

        var notes = result.data.map(function (note) {
            return {
                id: note.note_id,
                title: note.title,
                body: note.content
            };
        });

        return res.status(200).json({
            notes: notes
        });
    }

    if (req.method === 'POST') {
        var body = req.body || {};

        var noteId =
            typeof body.id === 'string' && body.id
                ? body.id
                : randomUUID();

        if (
            typeof body.title !== 'string' ||
            !body.title.trim() ||
            typeof body.body !== 'string' ||
            !body.body.trim()
        ) {
            return res.status(400).json({
                error: 'title and body are required'
            });
        }

        var insertResult = await supabase
            .from('notes')
            .insert({
                note_id: noteId,
                owner_id: login.userId,
                title: body.title.trim(),
                content: body.body.trim()
            });

        if (insertResult.error) {
            console.error('Supabase insert error:', insertResult.error);

            return res.status(500).json({
                error: 'Failed to create note'
            });
        }

        return res.status(201).json({
            id: noteId
        });
    }

    res.setHeader('Allow', 'GET, POST');

    return res.status(405).json({
        error: 'Method Not Allowed'
    });
}