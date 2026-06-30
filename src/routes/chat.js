/**
 * Chat API routes.
 * Supports direct messages, cohort-wide chats, and group conversations.
 * All authenticated users can chat. Socket.IO integration for real-time.
 */
const express = require('express');
const router = express.Router();
const knex = require('../config/db');
const { requireAuth } = require('../middleware/auth');

// All chat routes require login
router.use(requireAuth);

/**
 * GET /chat — list all conversations for the current user.
 * Shows last message preview, unread count.
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.session.user.id;

    // Get conversations the user is part of
    const conversations = await knex('chat_conversations')
      .select(
        'chat_conversations.*',
        knex.raw('(SELECT message FROM chat_messages WHERE conversation_id = chat_conversations.id ORDER BY created_at DESC LIMIT 1) as last_message'),
        knex.raw('(SELECT created_at FROM chat_messages WHERE conversation_id = chat_conversations.id ORDER BY created_at DESC LIMIT 1) as last_message_at'),
        knex.raw('(SELECT COUNT(*) FROM chat_messages WHERE conversation_id = chat_conversations.id AND created_at > COALESCE(cp.last_read_at, 0)) as unread_count')
      )
      .join('chat_participants as cp', 'cp.conversation_id', 'chat_conversations.id')
      .where('cp.user_id', userId)
      .orderBy('chat_conversations.last_message_at', 'desc')
      .orderBy('chat_conversations.updated_at', 'desc');

    // For each conversation, get participant names
    const convosWithPeople = await Promise.all(conversations.map(async (conv) => {
      const participants = await knex('chat_participants')
        .join('users', 'users.id', 'chat_participants.user_id')
        .where('chat_participants.conversation_id', conv.id)
        .select('users.id', 'users.first_name', 'users.last_name', 'users.photo_url');

      return { ...conv, participants };
    }));

    res.json({ conversations: convosWithPeople });
  } catch (err) {
    console.error('Chat list error:', err);
    res.status(500).json({ error: 'Failed to load conversations' });
  }
});

/**
 * GET /chat/:id — get a single conversation with messages.
 */
router.get('/:id', async (req, res) => {
  try {
    const userId = req.session.user.id;
    const convId = req.params.id;

    // Verify user is a participant
    const membership = await knex('chat_participants')
      .where({ conversation_id: convId, user_id: userId })
      .first();
    if (!membership) return res.status(403).json({ error: 'Not a member of this conversation' });

    // Get conversation details
    const conversation = await knex('chat_conversations').where('id', convId).first();

    // Get messages (last 50)
    const messages = await knex('chat_messages')
      .join('users', 'users.id', 'chat_messages.sender_id')
      .where('chat_messages.conversation_id', convId)
      .select(
        'chat_messages.*',
        knex.raw("users.first_name || ' ' || users.last_name as sender_name"),
        'users.photo_url as sender_photo'
      )
      .orderBy('chat_messages.created_at', 'asc')
      .limit(50);

    // Get reactions for messages
    const messageIds = messages.map(m => m.id);
    let reactions = [];
    if (messageIds.length) {
      reactions = await knex('chat_reactions')
        .whereIn('message_id', messageIds)
        .join('users', 'users.id', 'chat_reactions.user_id')
        .select('chat_reactions.*', knex.raw("users.first_name || ' ' || users.last_name as user_name"));
    }

    // Group reactions by message
    const reactionsByMsg = {};
    reactions.forEach(r => {
      if (!reactionsByMsg[r.message_id]) reactionsByMsg[r.message_id] = [];
      reactionsByMsg[r.message_id].push(r);
    });

    const messagesWithReactions = messages.map(m => ({
      ...m,
      reactions: reactionsByMsg[m.id] || [],
    }));

    // Mark as read
    await knex('chat_participants')
      .where({ conversation_id: convId, user_id: userId })
      .update({ last_read_at: knex.fn.now() });

    res.json({ conversation, messages: messagesWithReactions });
  } catch (err) {
    console.error('Chat detail error:', err);
    res.status(500).json({ error: 'Failed to load conversation' });
  }
});

/**
 * POST /chat/:id/message — send a message.
 */
router.post('/:id/message', async (req, res) => {
  try {
    const userId = req.session.user.id;
    const convId = req.params.id;
    const { message, message_type, attachment_url, attachment_name } = req.body;

    // Verify membership
    const membership = await knex('chat_participants')
      .where({ conversation_id: convId, user_id: userId })
      .first();
    if (!membership) return res.status(403).json({ error: 'Not a member of this conversation' });

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const [msgId] = await knex('chat_messages').insert({
      conversation_id: convId,
      sender_id: userId,
      message: message.trim(),
      message_type: message_type || 'text',
      attachment_url: attachment_url || null,
      attachment_name: attachment_name || null,
    });

    // Update conversation's last_message_at
    await knex('chat_conversations').where('id', convId).update({
      last_message_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    });

    const newMsg = await knex('chat_messages')
      .join('users', 'users.id', 'chat_messages.sender_id')
      .where('chat_messages.id', msgId)
      .select(
        'chat_messages.*',
        knex.raw("users.first_name || ' ' || users.last_name as sender_name"),
        'users.photo_url as sender_photo'
      )
      .first();

    res.status(201).json(newMsg);
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

/**
 * POST /chat/create — create a new conversation.
 */
router.post('/create', async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { type, title, participant_ids, cohort_id } = req.body;

    if (!type || !['direct', 'cohort', 'group'].includes(type)) {
      return res.status(400).json({ error: 'Invalid conversation type' });
    }

    if (!participant_ids || !Array.isArray(participant_ids) || !participant_ids.length) {
      return res.status(400).json({ error: 'At least one participant is required' });
    }

    // For direct messages, check if conversation already exists
    if (type === 'direct') {
      const otherUserId = participant_ids[0];
      const existing = await knex('chat_conversations')
        .join('chat_participants as cp1', 'cp1.conversation_id', 'chat_conversations.id')
        .join('chat_participants as cp2', 'cp2.conversation_id', 'chat_conversations.id')
        .where('chat_conversations.type', 'direct')
        .where('cp1.user_id', userId)
        .where('cp2.user_id', otherUserId)
        .select('chat_conversations.*')
        .first();

      if (existing) {
        return res.json({ conversation: existing, existing: true });
      }
    }

    // Create conversation
    const [convId] = await knex('chat_conversations').insert({
      type,
      title: title || null,
      cohort_id: cohort_id || null,
    });

    // Add creator + participants
    const allIds = [...new Set([userId, ...participant_ids])];
    const inserts = allIds.map(uid => ({
      conversation_id: convId,
      user_id: uid,
      is_admin: uid === userId,
    }));
    await knex('chat_participants').insert(inserts);

    // Add system message
    await knex('chat_messages').insert({
      conversation_id: convId,
      sender_id: null,
      message: 'Conversation started',
      message_type: 'system',
    });

    const conversation = await knex('chat_conversations').where('id', convId).first();
    res.status(201).json({ conversation });
  } catch (err) {
    console.error('Create conversation error:', err);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

/**
 * POST /chat/:id/react — react to a message.
 */
router.post('/:id/react', async (req, res) => {
  try {
    const userId = req.session.user.id;
    const messageId = req.params.id;
    const { emoji } = req.body;

    if (!emoji) return res.status(400).json({ error: 'Emoji is required' });

    // Check if reaction exists (toggle)
    const existing = await knex('chat_reactions')
      .where({ message_id: messageId, user_id: userId, emoji })
      .first();

    if (existing) {
      await knex('chat_reactions').where('id', existing.id).del();
      return res.json({ removed: true, emoji });
    } else {
      await knex('chat_reactions').insert({ message_id: messageId, user_id: userId, emoji });
      return res.json({ added: true, emoji });
    }
  } catch (err) {
    console.error('React error:', err);
    res.status(500).json({ error: 'Failed to react' });
  }
});

/**
 * GET /chat/search/users — search users to start a chat.
 */
router.get('/search/users', async (req, res) => {
  try {
    const userId = req.session.user.id;
    const q = req.query.q || '';

    const users = await knex('users')
      .where(function () {
        this.where('first_name', 'like', `%${q}%`)
          .orWhere('last_name', 'like', `%${q}%`)
          .orWhere('email', 'like', `%${q}%`);
      })
      .where('id', '!=', userId)
      .where('status', 'active')
      .select('id', 'first_name', 'last_name', 'email', 'photo_url', 'country', 'role')
      .limit(20);

    res.json({ users });
  } catch (err) {
    console.error('Search users error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

/**
 * GET /chat/cohorts — list user's cohorts (for cohort chat).
 */
router.get('/cohorts/mine', async (req, res) => {
  try {
    const userId = req.session.user.id;
    const cohorts = await knex('cohorts')
      .join('cohort_members', 'cohort_members.cohort_id', 'cohorts.id')
      .where('cohort_members.user_id', userId)
      .select('cohorts.*')
      .orderBy('cohorts.year', 'desc');

    res.json({ cohorts });
  } catch (err) {
    console.error('Cohorts error:', err);
    res.status(500).json({ error: 'Failed to load cohorts' });
  }
});

module.exports = router;
