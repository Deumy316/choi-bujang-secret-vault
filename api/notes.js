import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { createLoginVerifier } from '../src/verify-login.mjs';
import { createResourceId, RESOURCE_TYPES } from '../src/resource-id.mjs';
import { onlyOwnedNotes } from '../src/note-access.mjs';
import {
    executeCreateNoteRpc,
    NoteCreateError,
    prepareCreateNoteRpcInput
} from '../src/note-create.mjs';

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
            .eq('owner_id', login.userId)
            .order('id', { ascending: true });

        if (result.error) {
            console.error('Supabase list error:', result.error);

            return res.status(500).json({
                error: 'Failed to load notes'
            });
        }

        var notes = onlyOwnedNotes(result.data, login.userId)
            .map(function (note) {
                return {
                    id: note.note_id,
                    resourceId: createResourceId(RESOURCE_TYPES.NOTE, note.note_id),
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

        var noteId =
            typeof body.id === 'string' && body.id
                ? body.id
                : randomUUID();

        try {
            var input = prepareCreateNoteRpcInput({
                login: login,
                noteId: noteId,
                title: body.title, // 10단계: 받은 바이트 그대로 저장(앞뒤 공백·줄바꿈을 지우면 사본·복구가 원본과 달라짐)
                content: body.body
            });
            await executeCreateNoteRpc(supabase, input);
        } catch (error) {
            if (error instanceof NoteCreateError && error.status === 400) {
                return res.status(400).json({ error: 'Invalid note input' });
            }
            console.error('Atomic note creation failed');
            return res.status(500).json({ error: 'Failed to create note' });
        }

        return res.status(201).json({
            id: noteId,
            resourceId: createResourceId(RESOURCE_TYPES.NOTE, noteId)
        });
    }

    res.setHeader('Allow', 'GET, POST');

    return res.status(405).json({
        error: 'Method Not Allowed'
    });
}
