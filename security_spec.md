# Security Specification — Baraza Discussion Forum

## 1. Data Invariants
1. **Authenticated Non-Anonymous Identity & Anti-Spoofing**: All write operations (`create`, `update`, `delete`) require a non-anonymous authenticated Firebase user (`Google` or `Email/Password`). Author/reporter UIDs must strictly match `request.auth.uid` on creation and are immutable thereafter.
2. **PII Isolation**: User email addresses and phone numbers are stored exclusively in `/users/{userId}/private/info`, accessible only to the owning user or verified admins. Public `/users/{userId}` documents contain zero PII.
3. **Privilege Escalation Prevention**: Users cannot self-assign `role: "moderator"`, `verificationBadge` other than `'none'`, or pin topics (`isPinned: true`). Admin authority is verified strictly via `request.auth.token.email_verified == true` against the bootstrapped admin email or `/admins/{uid}`.
4. **Master Gate & Atomic Counters**: Replies cannot exist without an existing parent topic in `'open'` status. Creating a reply must atomically increment the parent topic's `repliesCount` via `getAfter`. Upvotes on topics and replies must atomically create/delete the voter's `/votes/{userId}` document via `existsAfter`.
5. **Terminal State Locking**: Once a topic is `'archived'`, regular users and authors cannot modify it; only verified admins can override.
6. **Temporal & Volumetric Integrity**: All `createdAt`, `updatedAt`, and `lastActivityAt` fields must equal `request.time`. All strings and arrays have strict bounded `.size()` checks.
7. **Account Suspension Enforcement**: Platform owner/admins can set `accountStatus: "suspended"` (and optional `suspendedReason`) on any member profile. Suspended users are blocked by `isNotSuspended()` from creating, updating, or deleting topics, replies, votes, reports, or profile fields.
8. **Strict 1-on-1 Direct Chat Confidentiality**: Private direct chats (`/direct_chats/{chatId}`) and their messages (`/direct_chats/{chatId}/messages/{messageId}`) are readable and writable ONLY by the exact two participants (`participantA` and `participantB`), with deterministic sorted `chatId == participantA + '__' + participantB` and ZERO admin read bypass.
9. **24-Hour Status & Viewer-List Privacy**: Mchart photo statuses (`/mchart_statuses/{statusId}`) require non-anonymous authentication (`isSignedIn()`), expire after 24 hours, respect `'members'` vs `'selected'` audience restrictions, and restrict `/views/{viewerId}` listing strictly to the status author.
10. **Strict Mchart Member-Only Gate & Locked Notes**: Group chat (`/forum_chat_messages`) and owner notes (`/mchart_notes`) require `isSignedIn()`. Locked note full content (`/mchart_notes/{noteId}/content/full`) is strictly unreadable unless `canReadProtectedNoteContent(noteId)` passes.
11. **View-Once Photo Scrubbing & Atomic Followers**: Recipient of a `viewOnce` direct photo can consume it exactly once, transitioning `viewOnceConsumed: true` and scrubbing `attachmentUrl: ""`. Member follow/unfollow atomically updates `followersCount` via `existsAfter`.
12. **Secure Community Voting & Single-Account Ballot Integrity**: Only verified platform owner (`isAdmin()`) can create, configure, close, or delete `/polls/{pollId}`. Unauthenticated guests can read open/closed poll questions, but CANNOT create or update `/ballots/{userId}` or `/tallies/{optionId}`. Each registered non-suspended member (`isNotSuspended()`) gets exactly one `/ballots/{userId}` keyed by `request.auth.uid`, validated atomically against `/polls/{pollId}.totalBallots` and `/tallies/{optionId}.votesCount` (`+/-1` only), with results visibility (`always`, `after_vote`, `after_close`, `owner_only`) and deadline (`endsAt > request.time`) enforced server-side in Firestore Rules.

## 2. Adversarial "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated / Anonymous Write**: Creating a topic when `request.auth == null` or `sign_in_provider == "anonymous"`.
2. **Author Spoofing**: Creating `/topics/t1` with `authorId: "other_uid"` != `request.auth.uid`.
3. **Self-Assigned Moderator / Verification Badge**: Creating or updating `/users/{uid}` with `role: "moderator"` or `verificationBadge: "government"` / `"owner"` as a non-admin.
4. **Shadow Field Injection**: Updating a topic with extra ghost field `isVerified: true`.
5. **Client Timestamp Forgery**: Creating a topic with `createdAt` set to a past date instead of `serverTimestamp()`.
6. **Orphaned Reply**: Creating `/topics/nonexistent/replies/r1` without an existing open parent topic.
7. **Reply on Locked Topic**: Creating a reply when parent topic `status == "locked"`.
8. **Counter Desync / Bypass**: Incrementing `topics/t1.repliesCount` without creating a reply, or creating a reply without incrementing `repliesCount`.
9. **Duplicate / Ghost Vote**: Incrementing `upvotesCount` on `/topics/t1` without creating `/topics/t1/votes/{uid}` in the same batch.
10. **PII Snooping**: User B attempting `get` on `/users/userA/private/info`.
11. **ID Poisoning**: Creating `/topics/` with an ID containing invalid characters (`../../evil`) or > 128 chars.
12. **Blanket Query Scraping**: Querying `/reports` without filtering `reporterId == request.auth.uid` as a non-admin.
13. **Third-Party DM Snooping**: User C (even an admin) attempting `get` or `list` on `/direct_chats/uidA__uidB` or `/direct_chats/uidA__uidB/messages`.
14. **Private Status Leakage**: Non-whitelisted User C attempting `get` or `list` on a `privacy: "selected"` status where C is not in `audienceTokens`.
15. **Status Viewer-List Snooping**: Non-author User B attempting `list` on `/mchart_statuses/s1/views` to discover who viewed User A's status.
16. **Unauthenticated Mchart Snooping**: Guest (`request.auth == null`) attempting `get` or `list` on `/forum_chat_messages` or `/mchart_notes`.
17. **Sender Replay / Re-open of View-Once Photo**: Attempting to reset `viewOnceConsumed` back to `false` or restore `attachmentUrl`.
18. **Guest / Duplicate / Stuffed Poll Ballot**: Unauthenticated guest attempting to cast a ballot, voter attempting to create `/polls/p1/ballots/otherUid`, voter attempting to increment `/polls/p1/tallies/opt1.votesCount` by `+10`, or reading `owner_only` / `after_close` tallies early.
