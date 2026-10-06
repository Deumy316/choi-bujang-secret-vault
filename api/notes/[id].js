import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import { createLoginVerifier } from '../../src/verify-login.mjs';

var require = createRequire(import.meta.url);
var config = require('../../aleph.config.json');

var verifyLogin;

var UUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

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

async function findNote(supabase, noteId) {
    var result = await supabase
        .from('notes')
        .select('note_id, title, content, owner_id')
        .eq('note_id', noteId)
        .maybeSingle();

    if (result.error) {
        throw result.error;
    }

    return result.data;
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

    var noteId = req.query.id;

    if (Array.isArray(noteId)) {
        noteId = noteId[0];
    }

    if (typeof noteId !== 'string' || !UUID.test(noteId)) {
        return res.status(400).json({
            error: 'Invalid note id'
        });
    }

    var supabase = getSupabase();
    var existingNote;

    try {
        existingNote = await findNote(supabase, noteId);
    } catch (error) {
        console.error('Supabase note lookup error:', error);

        return res.status(500).json({
            error: 'Failed to load note'
        });
    }

    if (!existingNote) {
        return res.status(404).json({
            error: 'Note not found'
        });
    }

    if (existingNote.owner_id !== login.userId) {
        return res.status(403).json({
            error: 'Forbidden'
        });
    }

    if (req.method === 'GET') {
        return res.status(200).json({
            id: existingNote.note_id,
            title: existingNote.title,
            body: existingNote.content
        });
    }

    if (req.method === 'PUT') {
        var body = req.body || {};

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

        var updateResult = await supabase
            .from('notes')
            .update({
                title: body.title.trim(),
                content: body.body.trim(),
                owner_id: login.userId
            })
            .eq('note_id', noteId)
            .eq('owner_id', login.userId)
            .select('note_id, owner_id');

        if (updateResult.error) {
            console.error('Supabase update error:', updateResult.error);

            return res.status(500).json({
                error: 'Failed to update note'
            });
        }

        if (
            !updateResult.data ||
            updateResult.data.length !== 1 ||
            updateResult.data[0].owner_id !== login.userId
        ) {
            return res.status(403).json({
                error: 'Forbidden'
            });
        }

        return res.status(200).json({
            id: noteId
        });
    }

    if (req.method === 'DELETE') {
        var deleteResult = await supabase
            .from('notes')
            .delete()
            .eq('note_id', noteId)
            .eq('owner_id', login.userId)
            .select('note_id');

        if (deleteResult.error) {
            console.error('Supabase delete error:', deleteResult.error);

            return res.status(500).json({
                error: 'Failed to delete note'
            });
        }

        if (!deleteResult.data || deleteResult.data.length !== 1) {
            return res.status(403).json({
                error: 'Forbidden'
            });
        }

        return res.status(200).json({
            id: noteId
        });
    }

    res.setHeader('Allow', 'GET, PUT, DELETE');

    return res.status(405).json({
        error: 'Method Not Allowed'
    });
}