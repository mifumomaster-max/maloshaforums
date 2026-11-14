# Security Specification — Baraza Discussion Forum

## 1. Data Invariants
1. **Verified Identity & Anti-Spoofing**: All write operations (`create`, `update`, `delete`) require an authenticated Firebase user with `email_verified == true`. Author/reporter UIDs must strictly match `request.auth.uid` on creation and are immutable thereafter.
2. **PII Isolation**: User email addresses are stored exclusively in `/users/{userId}/private/info`, accessible only to the owning user or verified admins. Public `/users/{userId}` documents contain zero PII.
3. **Privilege Escalation Prevention**: Users cannot self-assign `role: "moderator"`, `verificationBadge` other than `'none'`, or pin topics (`isPinned: true`). Admin authority is verified strictly via `request.auth.token.email_verified == true` against the bootstrapped admin email or `/admins/{uid}`.
4. **Master Gate & Atomic Counters**: Replies cannot exist without an existing parent topic in `'open'` status. Creating a reply must atomically increment the parent topic's `repliesCount` via `getAfter`. Upvotes on topics and replies must atomically create/delete the voter's `/votes/{userId}` document via `existsAfter`.
5. **Terminal State Locking**: Once a topic is `'archived'`, regular users and authors cannot modify it; only verified admins can override.
6. **Temporal & Volumetric Integrity**: All `createdAt`, `updatedAt`, and `lastActivityAt` fields must equal `request.time`. All strings and arrays have strict bounded `.size()` checks.

## 2. Adversarial "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Unverified Email Write**: Creating a topic with `email_verified: false`.
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
