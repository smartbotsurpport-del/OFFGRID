'use strict';

const { initializeApp } = require('firebase-admin/app');
const { getDatabase, ServerValue } = require('firebase-admin/database');
const { onCall, HttpsError } = require('firebase-functions/v2/https');

initializeApp();

const REGION = 'asia-northeast3';
const DURATIONS = {
  '1m': 60_000, '3m': 180_000, '5m': 300_000,
  '1h': 3_600_000, '3h': 10_800_000, '5h': 18_000_000,
  '1d': 86_400_000, '3d': 259_200_000, '5d': 432_000_000,
  '7d': 604_800_000, permanent: 0,
};
const GAME_ACTIONS = new Set(['kill', 'freeze', 'god', 'tp', 'to', 'give', 'ammo', 'heal', 'clear', 'team']);
const STAFF_COMMANDS = new Set([
  'kill', 'kick', 'ban', 'pardon', 'mute', 'unmute', 'freeze', 'warn', 'sayall', 'say',
  'fly', 'tp', 'to', 'god', 'vanish', 'spec', 'tpgod', 'togod', 'killgod', 'allgod',
  'give', 'ammo', 'heal', 'clear', 'team',
]);
const PROTECTED = {
  kill: ['killgod'],
  freeze: [],
  god: [],
  tp: ['tpgod'],
  to: ['togod'],
  give: [], ammo: [], heal: [], clear: [], team: [],
};

function fail(code, message) { throw new HttpsError(code, message); }
function uidOrFail(value, label = '대상') {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(value)) fail('invalid-argument', `${label} 계정을 찾을 수 없습니다.`);
  return value;
}
function cleanMessage(value, max = 240) {
  if (typeof value !== 'string') fail('invalid-argument', '메시지를 입력하세요.');
  const text = value.trim().slice(0, max);
  if (!text) fail('invalid-argument', '메시지를 입력하세요.');
  return text;
}
function cleanPosition(value, label) {
  if (!value || !['x', 'y', 'z'].every(key => Number.isFinite(Number(value[key])) && Math.abs(Number(value[key])) <= 10_000)) {
    fail('invalid-argument', `${label} 위치를 확인할 수 없습니다.`);
  }
  return { x: Number(value.x), y: Number(value.y), z: Number(value.z) };
}
function requireAdmin(request) {
  if (!request.auth) fail('unauthenticated', 'Google 또는 게스트 계정으로 로그인하세요.');
  if (request.auth.token.admin !== true) fail('permission-denied', 'OP 권한이 필요합니다.');
  return request.auth.uid;
}
async function readValue(path) {
  const snap = await getDatabase().ref(path).get();
  return snap.exists() ? snap.val() : null;
}
async function pushInbox(targetUid, payload, actorUid) {
  await getDatabase().ref(`adminInbox/${targetUid}`).push({
    ...payload,
    issuedBy: actorUid,
    createdAt: ServerValue.TIMESTAMP,
  });
}
async function targetProtection(targetUid, action) {
  const [state, defenses] = await Promise.all([
    readValue(`moderation/users/${targetUid}`),
    readValue(`moderation/users/${targetUid}/defenses`),
  ]);
  const allGod = !!defenses?.allgod;
  if (action === 'kill' && (allGod || defenses?.killgod)) fail('failed-precondition', '대상이 kill 보호 상태입니다.');
  if (action === 'tp' && (allGod || defenses?.tpgod)) fail('failed-precondition', '대상이 강제 소환을 차단했습니다.');
  if (action === 'to' && (allGod || defenses?.togod)) fail('failed-precondition', '대상이 관리자 순간이동을 차단했습니다.');
  if (allGod && ['kick', 'ban', 'mute', 'warn', 'freeze', 'god', 'give', 'ammo', 'heal', 'clear', 'team'].includes(action)) {
    fail('failed-precondition', '대상이 allgod 보호 상태입니다.');
  }
  return state || {};
}
async function toggleBoolean(path) {
  const result = await getDatabase().ref(path).transaction(value => !value);
  return !!result.snapshot.val();
}
async function audit(actorUid, command, targetUid, detail = {}) {
  await getDatabase().ref('adminAudit').push({
    actorUid, command, targetUid: targetUid || null,
    detail, createdAt: ServerValue.TIMESTAMP,
  });
}
async function requireOnline(targetUid, requireActive = false) {
  const presence = await readValue(`onlineUsers/${targetUid}`);
  if (!presence || presence.online !== true) fail('not-found', '대상이 현재 온라인이 아닙니다.');
  if (requireActive && presence.playerState?.active !== true) fail('failed-precondition', '대상이 현재 매치에 들어가 있지 않습니다.');
  return presence;
}

exports.adminCommand = onCall({ region: REGION, maxInstances: 10 }, async request => {
  const actorUid = requireAdmin(request);
  const data = request.data || {};
  const command = String(data.command || '').toLowerCase();
  if (!STAFF_COMMANDS.has(command)) fail('invalid-argument', '지원하지 않는 명령입니다.');
  const db = getDatabase();
  let targetUid = data.targetUid ? uidOrFail(data.targetUid) : null;
  let result = { command, ok: true };

  if (command === 'sayall') {
    const message = cleanMessage(data.message);
    const item = db.ref('announcements/global').push();
    await item.set({ message, by: request.auth.token.name || 'OP', createdAt: ServerValue.TIMESTAMP });
    result.message = '전체 공지를 전송했습니다.';
  } else if (command === 'say') {
    const roomCode = String(data.roomCode || '').toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(roomCode)) fail('failed-precondition', '파티 로비에 참가한 뒤 /say를 사용하세요.');
    const message = cleanMessage(data.message);
    const room = await readValue(`rooms/${roomCode}/meta`);
    if (!room || room.status !== 'open') fail('not-found', '현재 파티 채널을 찾을 수 없습니다.');
    await db.ref(`rooms/${roomCode}/messages`).push({ uid: 'system', name: 'SERVER', text: message, system: true, createdAt: ServerValue.TIMESTAMP });
    result.message = '현재 파티에 공지를 전송했습니다.';
  } else if (['tpgod', 'togod', 'killgod', 'allgod'].includes(command)) {
    const enabled = await toggleBoolean(`moderation/users/${actorUid}/defenses/${command}`);
    result.enabled = enabled;
    result.message = `${command} ${enabled ? '활성화' : '해제'}했습니다.`;
  } else if (command === 'vanish') {
    const path = `onlineUsers/${actorUid}/hidden`;
    const enabled = await toggleBoolean(path);
    result.enabled = enabled;
    result.message = `vanish ${enabled ? '활성화' : '해제'}했습니다.`;
  } else {
    if (!targetUid) targetUid = actorUid;
    const isSelf = targetUid === actorUid;
    const state = await targetProtection(targetUid, command);
    if (targetUid !== actorUid && !['kick', 'ban', 'pardon', 'mute', 'unmute', 'warn'].includes(command) && state?.banned === true && (state.banUntil === 0 || state.banUntil > Date.now())) {
      fail('failed-precondition', '대상 계정은 밴 상태입니다.');
    }

    if (command === 'kick') {
      await requireOnline(targetUid);
      await pushInbox(targetUid, { type: 'kick', message: '관리자에 의해 로비에서 퇴장되었습니다.' }, actorUid);
      result.message = '대상을 퇴장시켰습니다. 다시 로그인할 수 있습니다.';
    } else if (command === 'ban') {
      const duration = String(data.duration || '');
      if (!(duration in DURATIONS)) fail('invalid-argument', '지원하지 않는 밴 기간입니다.');
      const permanent = duration === 'permanent';
      const banUntil = permanent ? 0 : Date.now() + DURATIONS[duration];
      await db.ref(`moderation/users/${targetUid}`).update({ banned: true, banUntil, banReason: cleanMessage(data.reason || '관리자 제재', 120), bannedBy: actorUid, updatedAt: ServerValue.TIMESTAMP });
      await pushInbox(targetUid, { type: 'ban', banUntil, permanent, message: permanent ? '계정이 영구 차단되었습니다.' : '계정이 기간 차단되었습니다.' }, actorUid);
      result.message = permanent ? '영구 밴을 적용했습니다.' : `밴을 ${duration} 동안 적용했습니다.`;
    } else if (command === 'pardon') {
      await db.ref(`moderation/users/${targetUid}`).update({ banned: false, banUntil: null, banReason: null, updatedAt: ServerValue.TIMESTAMP });
      await pushInbox(targetUid, { type: 'pardon', message: '계정 차단이 해제되었습니다.' }, actorUid);
      result.message = '밴을 해제했습니다.';
    } else if (command === 'mute') {
      const duration = String(data.duration || '');
      if (!(duration in DURATIONS)) fail('invalid-argument', '지원하지 않는 뮤트 기간입니다.');
      const muteUntil = duration === 'permanent' ? 0 : Date.now() + DURATIONS[duration];
      await db.ref(`moderation/users/${targetUid}`).update({ muted: true, muteUntil, updatedAt: ServerValue.TIMESTAMP });
      await pushInbox(targetUid, { type: 'mute', muteUntil, permanent: duration === 'permanent', message: '텍스트 채팅이 차단되었습니다.' }, actorUid);
      result.message = `텍스트 채팅을 ${duration === 'permanent' ? '영구' : duration + ' 동안'} 차단했습니다.`;
    } else if (command === 'unmute') {
      await db.ref(`moderation/users/${targetUid}`).update({ muted: false, muteUntil: null, updatedAt: ServerValue.TIMESTAMP });
      await pushInbox(targetUid, { type: 'unmute', message: '텍스트 채팅 차단이 해제되었습니다.' }, actorUid);
      result.message = '뮤트를 해제했습니다.';
    } else if (command === 'warn') {
      const reason = cleanMessage(data.reason || '관리자 경고', 180);
      const warningRef = db.ref(`moderation/users/${targetUid}/warnings`).push();
      await warningRef.set({ reason, by: actorUid, createdAt: ServerValue.TIMESTAMP });
      await pushInbox(targetUid, { type: 'warn', message: reason }, actorUid);
      result.message = '경고를 전달했습니다.';
    } else if (command === 'freeze') {
      await targetProtection(targetUid, 'freeze');
      const enabled = await toggleBoolean(`moderation/users/${targetUid}/frozen`);
      await pushInbox(targetUid, { type: 'freeze', enabled }, actorUid);
      result.enabled = enabled; result.message = `freeze ${enabled ? '적용' : '해제'}했습니다.`;
    } else if (command === 'god') {
      const enabled = await toggleBoolean(`moderation/users/${targetUid}/god`);
      await pushInbox(targetUid, { type: 'god', enabled }, actorUid);
      result.enabled = enabled; result.message = `god ${enabled ? '활성화' : '해제'}했습니다.`;
    } else if (command === 'kill') {
      await targetProtection(targetUid, 'kill');
      await requireOnline(targetUid, true);
      await pushInbox(targetUid, { type: 'kill' }, actorUid);
      result.message = '대상에게 kill 명령을 전달했습니다.';
    } else if (command === 'tp') {
      await targetProtection(targetUid, 'tp');
      await requireOnline(targetUid, true);
      await requireOnline(actorUid, true);
      const actorPosition = cleanPosition(data.actorPosition, '관리자');
      await pushInbox(targetUid, { type: 'teleport', ...actorPosition }, actorUid);
      result.message = '대상을 내 앞으로 이동시켰습니다.';
    } else if (command === 'to') {
      await targetProtection(targetUid, 'to');
      await requireOnline(targetUid, true);
      await requireOnline(actorUid, true);
      const targetPosition = cleanPosition(data.targetPosition, '대상');
      await pushInbox(actorUid, { type: 'teleport', ...targetPosition }, actorUid);
      result.message = '대상 위치로 이동했습니다.';
    } else if (command === 'give') {
      const code = String(data.code || '').toLowerCase();
      const quantity = Math.max(1, Math.min(10, Number(data.quantity) || 1));
      if (!['pistol', 'smg', 'ar', 'shotgun', 'sniper', 'aurora', 'light', 'medium', 'shell', 'heavy', 'bandage', 'medkit', 'cell', 'grenade'].includes(code)) fail('invalid-argument', '알 수 없는 무기 코드 또는 아이템입니다.');
      await requireOnline(targetUid, true);
      await pushInbox(targetUid, { type: 'give', code, quantity }, actorUid);
      result.message = `${code} 지급 명령을 전달했습니다.`;
    } else if (['ammo', 'heal', 'clear'].includes(command)) {
      await requireOnline(targetUid, true);
      await pushInbox(targetUid, { type: command }, actorUid);
      result.message = `${command} 명령을 전달했습니다.`;
    } else if (command === 'team') {
      const team = cleanMessage(data.team || '', 24);
      await requireOnline(targetUid, true);
      await pushInbox(targetUid, { type: 'team', team }, actorUid);
      result.message = `팀을 ${team}(으)로 변경했습니다.`;
    } else {
      fail('invalid-argument', '지원하지 않는 서버 명령입니다.');
    }
    await audit(actorUid, command, targetUid, { self: isSelf });
  }

  if (['say', 'sayall'].includes(command)) await audit(actorUid, command, null);
  return result;
});
