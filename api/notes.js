import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    var supabaseUrl = process.env.SUPABASE_URL;
    var supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseSecretKey) {
        return res.status(500).json({ error: 'Server configuration error' });
    }

    var supabase = createClient(supabaseUrl, supabaseSecretKey);

    var result = await supabase
        .from('notes')
        .select('title, content')
        .order('id', { ascending: true });

    if (result.error) {
        console.error('Supabase error:', result.error);
        return res.status(500).json({ error: 'Failed to load notes' });
    }

    return res.status(200).json({
        notes: result.data
    });
}