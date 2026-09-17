export const team = {
  en: {
    "team.title": "Workspaces",
    "team.preview": "Team preview",
    "team.loading": "Loading workspace…",
    "team.retry": "Try again",
    "team.indexTitle": "A shared space for your team",
    "team.create": "Create workspace",
    "team.personal": "Continue with personal account",
    "team.myTeams": "Your workspaces",
    "team.pending": "Pending invitations",
    "team.pendingDesc":
      "Open the invitation in your email to review and join the workspace.",
    "team.newTitle": "Name your workspace",
    "team.name": "Workspace name",
    "team.nameHint":
      "Up to 80 characters. A unique address is created automatically.",
    "team.placeholder": "e.g. Studio team",
    "team.step1": "1. Workspace",
    "team.step2": "2. Invite team",
    "team.step3": "3. Ready",
    "team.previewTerms":
      "{seats} member seats. Reviewers are free, and creating a workspace does not charge you.",
    "team.remaining": "You can create {count} more.",
    "team.creating": "Creating workspace…",
    "team.inviteTitle": "Invite your team",
    "team.inviteDesc":
      "Invitations expire in 7 days. You can skip this step and invite people later.",
    "team.emails": "Email addresses",
    "team.emailsHint":
      "Separate addresses with commas or new lines. Up to 20 per batch.",
    "team.role": "Role",
    "team.role.owner": "Owner",
    "team.role.admin": "Admin",
    "team.role.editor": "Editor",
    "team.role.reviewer": "Reviewer",
    "team.roleHelp":
      "Editors use a seat. Reviewers do not. Only the owner can invite admins.",
    "team.send": "Send invitations",
    "team.sending": "Sending invitations…",
    "team.validCount": "{count} valid addresses",
    "team.batchLimit": "Send up to 20 addresses at a time.",
    "team.finish": "Finish setup",
    "team.skip": "Skip for now",
    "team.finishing": "Saving…",
    "team.readyTitle": "Your workspace is ready",
    "team.readyDesc":
      "Your team has a shared workspace. You can manage invitations and see who has joined below.",
    "team.seats": "Member seats",
    "team.members": "Members",
    "team.invitations": "Invitations",
    "team.noInvitations": "No invitations yet.",
    "team.status": "Status",
    "team.resend": "Resend",
    "team.revoke": "Revoke",
    "team.revokeConfirm": "Revoke this invitation?",
    "team.cancel": "Keep invitation",
    "team.waitResend": "You can resend after one minute.",
    "team.status.ready": "Ready to send",
    "team.status.sent": "Sent · awaiting acceptance",
    "team.status.failed": "Could not send · retry",
    "team.status.sending": "Sending",
    "team.status.interrupted": "Delivery not confirmed · retry",
    "team.status.accepted": "Joined",
    "team.status.revoked": "Revoked",
    "team.status.expired": "Expired",
    "team.status.invalid_email": "Invalid email address",
    "team.status.duplicate": "Duplicate address",
    "team.status.already_member": "Already a member",
    "team.status.already_invited": "Already invited · manage below",
    "team.status.seat_limit": "No member seats left",
    "team.status.retry_later": "Wait one minute before resending",
    "team.expires": "Expires {date}",
    "team.continueSetup": "Continue setup",
    "team.open": "Open workspace",
    "team.cloudTitle": "Cloud media is coming next",
    "team.cloudDesc":
      "Upload and a shared team archive will be added in the next release. Continue editing local projects in the desktop app.",
    "team.acceptTitle": "You have a team invitation",
    "team.acceptDesc":
      "Review the workspace and role before joining. Joining does not change your personal subscription.",
    "team.invitedTo": "Workspace",
    "team.invitedAs": "You will join as",
    "team.accept": "Join workspace",
    "team.accepting": "Joining…",
    "team.alreadyAccepted":
      "This invitation has already been accepted. You can open your workspace.",
    "team.switchAccount": "Use a different account",
    "team.invitedEmail": "Invited email",
    "team.acceptPending": "Accept invitation",
    "team.verifyTitle": "Verify your email address",
    "team.verifyBody":
      "Open the link we sent to your account's email address. Verifying lets you accept team invitations.",
    "team.verifyPending":
      "{count} team invitation(s) are waiting for you. Verify your email to see who invited you and join.",
    "team.verifyResend": "Resend verification email",
    "team.verifySending": "Sending…",
    "team.verifySent":
      "Verification email sent. Check your inbox, including spam.",
    "team.verifyConfirmTitle": "Email verification",
    "team.verifyConfirmDesc":
      "We are confirming the link from your verification email.",
    "team.verifyChecking": "Verifying your email…",
    "team.verifyDone": "Your email address is verified.",
    "team.verifyDoneDesc":
      "You can now accept team invitations sent to this address.",
    "team.verifyOpenTeams": "Go to workspaces",
    "team.error.EMAIL_VERIFICATION_TOKEN_INVALID":
      "This verification link is not valid. Open the most recent verification email, or send a new one.",
    "team.error.EMAIL_VERIFICATION_TOKEN_EXPIRED":
      "This verification link expired. Send a new verification email and use the newest link.",
    "team.error.EMAIL_VERIFICATION_TOKEN_USED":
      "This link was already used. Your email is verified — sign in to continue.",
    "team.error.EMAIL_VERIFICATION_RATE_LIMITED":
      "Too many verification emails were requested. Wait a few minutes, then use the newest link you received.",
    "team.seatRequest":
      "Ask the workspace owner ({email}) to add seats. Your draft stays on this page.",
    "team.seatRequestAction": "Email the owner",
    "team.error.WORKSPACES_DISABLED":
      "Team onboarding is not available for this environment yet. You can continue with your personal account.",
    "team.error.WORKSPACES_UNREACHABLE":
      "We could not reach the team service. Your account and personal tools are unaffected — try again in a moment.",
    "team.error.WORKSPACES_EMPTY":
      "Every account has a workspace, so this list should never be empty. Yours may still be getting ready — try again in a moment.",
    "team.error.WORKSPACE_CREATE_LIMIT_REACHED":
      "You have created as many workspaces as this account can. Open one you already have, or leave one you no longer need.",
    "team.error.WORKSPACE_CREATION_UNAVAILABLE":
      "Workspace creation is available to preview accounts. If you were invited, open your invitation email.",
    "team.error.WORKSPACE_NAME_INVALID":
      "Enter a workspace name between 1 and 80 characters.",
    "team.error.WORKSPACE_NOT_FOUND":
      "This workspace is unavailable or you no longer have access. Choose another workspace or continue with your personal account.",
    "team.error.WORKSPACE_ADMIN_REQUIRED":
      "Only workspace owners and admins can manage invitations.",
    "team.error.WORKSPACE_OWNER_REQUIRED":
      "Only the workspace owner can invite or manage admins.",
    "team.error.WORKSPACE_SEAT_LIMIT":
      "There are no member seats available. Ask your workspace owner to free a seat.",
    "team.error.INVITATION_EMAIL_MISMATCH":
      "This invitation is for a different email address. Sign in with the address that received the invitation.",
    "team.error.INVITATION_UNAVAILABLE":
      "This invitation link is unavailable. Check for a newer invitation email or ask your workspace admin to send another.",
    "team.error.INVITATION_EXPIRED":
      "This invitation expired. Ask your workspace admin to send a new invitation.",
    "team.error.INVITATION_REVOKED":
      "This invitation was revoked. Ask your workspace admin for a new invitation.",
    "team.error.INVITATION_ALREADY_ACCEPTED":
      "This invitation was already accepted. Refresh to see the current membership.",
    "team.error.RATE_LIMIT": "Too many requests. Wait a moment and try again.",
    "team.error.REQUEST_FAILED":
      "We could not complete the request. Your input is saved on this page. Check your connection and try again.",
     "team.error.WORKSPACE_PERSONAL_INVITE_FORBIDDEN":
      "A personal space cannot be invited into. Create a team and invite people there — your personal space stays yours alone.",
    "team.error.WORKSPACE_PERSONAL_DELETE_FORBIDDEN":
      "A personal space cannot be deleted. Every account has exactly one, and it is not a team you can close.",
    "team.error.WORKSPACE_PERSONAL_MEMBERS_FORBIDDEN":
      "A personal space has no members to manage. Create a team if you need to work with other people.",
    "team.error.WORKSPACE_PERSONAL_LEAVE_FORBIDDEN":
      "A personal space cannot be left. There is nobody else in it to leave it to.",
    "team.error.WORKSPACE_PERSONAL_TRANSFER_FORBIDDEN":
      "A personal space cannot be handed to anyone else. Move the work into a team if someone else needs to own it.",
    "team.openPersonal": "Open your space",
    "team.kind.personal": "Personal space",
    "team.kind.team": "Team",
    "team.personalTitle": "Your personal space",
    "team.personalDesc":
      "Only you. No members, no seats.",
    "team.personalOne":
      "This is your space. Create a team when you want to work with other people — your personal space stays exactly as it is.",
    "team.personalNoTeams": "You are not in a team yet.",
    "team.teamsHeading": "Teams",
    "team.spaceHeading": "Your space",
    "team.makeTeam": "Create a team",
    "team.personalNoMembers":
      "A personal space has no members, no roles and no invitations. To work with someone, create a team and invite them there.",
    "team.here": "You are in",
    "team.hereTeam": "Anything you do here is visible to this team.",
    "team.herePersonal": "Anything you do here is visible only to you.",
    "team.seatActive": "Active members",
    "team.seatInvited": "Held by invitations",
    "team.seatSuspended": "Suspended",
    "team.seatRemaining": "Seats remaining",
    "team.seatReviewers": "Reviewers",
    "team.seatHolds": "Holds a seat",
    "team.seatFree": "Holds no seat",
    "team.seatSplit":
      "An unaccepted invitation holds a seat.",
    "team.capsTitle": "What each role can do",
    "team.capsHint":
      "A role is the ceiling on what someone can do. An admin cannot promote anyone — themselves included — to owner.",
    "team.caps.billing": "Billing, seats, ownership, deleting the team",
    "team.caps.people": "Invite, change roles, suspend, remove",
    "team.caps.projects": "Upload and download originals",
    "team.caps.publish": "Edit in the app, publish a version",
    "team.caps.comment": "Comment on a review",
    "team.caps.seat": "Uses a paid seat",
    "team.caps.yes": "Yes",
    "team.caps.no": "No",
    "team.caps.scoped": "Within access",
    "team.caps.notOwner": "Not the owner",
    "team.startPersonalTitle": "Your personal space is ready",
    "team.startPersonalBody":
      "Nobody else can see it. A team is a separate space you can make any time.",
    "team.startTeamName": "Team name",
    "team.startTeamHint":
      "Use your company, studio or team name. You can invite people in the next step.",
    "team.startNoTeam":
      "You have no team yet, so there is nobody to invite. Create one above whenever you want to, or carry on.",
  },
  ko: {
    "team.title": "워크스페이스",
    "team.preview": "팀 미리보기",
    "team.loading": "워크스페이스를 불러오는 중…",
    "team.retry": "다시 시도",
    "team.indexTitle": "팀이 함께하는 작업 공간",
    "team.create": "워크스페이스 만들기",
    "team.personal": "개인 계정으로 계속",
    "team.myTeams": "내 워크스페이스",
    "team.pending": "대기 중인 초대",
    "team.pendingDesc":
      "이메일로 받은 초대 링크에서 내용을 확인하고 참여하세요.",
    "team.newTitle": "워크스페이스 이름을 정하세요",
    "team.name": "워크스페이스 이름",
    "team.nameHint": "최대 80자. 고유한 주소가 자동으로 만들어집니다.",
    "team.placeholder": "예: 스튜디오 팀",
    "team.step1": "1. 워크스페이스",
    "team.step2": "2. 팀원 초대",
    "team.step3": "3. 완료",
    "team.previewTerms":
      "멤버 {seats}석. 검토자는 무료이고, 만들어도 결제되지 않습니다.",
    "team.remaining": "{count}개를 더 만들 수 있습니다.",
    "team.creating": "워크스페이스를 만드는 중…",
    "team.inviteTitle": "함께할 팀원을 초대하세요",
    "team.inviteDesc":
      "초대는 7일 동안 유효합니다. 이 단계를 건너뛰고 나중에 초대해도 됩니다.",
    "team.emails": "이메일 주소",
    "team.emailsHint":
      "쉼표 또는 줄바꿈으로 구분하세요. 한 번에 최대 20명까지 초대할 수 있습니다.",
    "team.role": "역할",
    "team.role.owner": "소유자",
    "team.role.admin": "관리자",
    "team.role.editor": "편집자",
    "team.role.reviewer": "검토자",
    "team.roleHelp":
      "편집자는 좌석을 쓰고 검토자는 쓰지 않습니다. 관리자 초대는 소유자만 가능합니다.",
    "team.send": "초대 보내기",
    "team.sending": "초대를 보내는 중…",
    "team.validCount": "유효한 주소 {count}개",
    "team.batchLimit": "한 번에 최대 20명까지 보내주세요.",
    "team.finish": "설정 완료",
    "team.skip": "나중에 초대하기",
    "team.finishing": "저장 중…",
    "team.readyTitle": "워크스페이스가 준비되었습니다",
    "team.readyDesc":
      "팀의 작업 공간이 만들어졌습니다. 아래에서 초대를 관리하고 참여한 팀원을 확인하세요.",
    "team.seats": "멤버 좌석",
    "team.members": "멤버",
    "team.invitations": "초대",
    "team.noInvitations": "아직 보낸 초대가 없습니다.",
    "team.status": "상태",
    "team.resend": "재발송",
    "team.revoke": "초대 취소",
    "team.revokeConfirm": "이 초대를 취소할까요?",
    "team.cancel": "초대 유지",
    "team.waitResend": "1분 후 다시 보낼 수 있습니다.",
    "team.status.ready": "발송 가능",
    "team.status.sent": "발송됨 · 수락 대기",
    "team.status.failed": "발송 실패 · 재시도 필요",
    "team.status.sending": "발송 중",
    "team.status.interrupted": "발송 확인 필요 · 재시도",
    "team.status.accepted": "참여 완료",
    "team.status.revoked": "취소됨",
    "team.status.expired": "만료됨",
    "team.status.invalid_email": "올바르지 않은 이메일",
    "team.status.duplicate": "중복 주소",
    "team.status.already_member": "이미 참여한 멤버",
    "team.status.already_invited": "이미 초대됨 · 아래에서 관리",
    "team.status.seat_limit": "남은 멤버 좌석 없음",
    "team.status.retry_later": "1분 후 다시 보내주세요",
    "team.expires": "{date} 만료",
    "team.continueSetup": "설정 이어하기",
    "team.open": "워크스페이스 열기",
    "team.cloudTitle": "클라우드 영상은 다음 단계에서",
    "team.cloudDesc":
      "업로드와 팀 아카이브 공유는 다음 출시에서 연결됩니다. 데스크톱 앱에서 로컬 프로젝트 편집을 계속할 수 있습니다.",
    "team.acceptTitle": "팀 초대를 받았습니다",
    "team.acceptDesc":
      "참여할 워크스페이스와 역할을 확인하세요. 참여해도 개인 구독은 변경되지 않습니다.",
    "team.invitedTo": "워크스페이스",
    "team.invitedAs": "참여 역할",
    "team.accept": "워크스페이스 참여",
    "team.accepting": "참여하는 중…",
    "team.alreadyAccepted":
      "이미 수락한 초대입니다. 워크스페이스로 이동할 수 있습니다.",
    "team.switchAccount": "다른 계정으로 로그인",
    "team.invitedEmail": "초대받은 이메일",
    "team.acceptPending": "초대 수락",
    "team.verifyTitle": "이메일 주소를 인증해 주세요",
    "team.verifyBody":
      "계정 이메일 주소로 보낸 링크를 열어주세요. 인증하면 팀 초대를 수락할 수 있습니다.",
    "team.verifyPending":
      "받은 팀 초대가 {count}개 있습니다. 이메일을 인증하면 어느 팀인지 확인하고 참여할 수 있습니다.",
    "team.verifyResend": "인증 메일 다시 보내기",
    "team.verifySending": "보내는 중…",
    "team.verifySent":
      "인증 메일을 보냈습니다. 받은 편지함과 스팸함을 확인하세요.",
    "team.verifyConfirmTitle": "이메일 인증",
    "team.verifyConfirmDesc": "인증 메일의 링크를 확인하고 있습니다.",
    "team.verifyChecking": "이메일을 인증하는 중…",
    "team.verifyDone": "이메일 주소를 인증했습니다.",
    "team.verifyDoneDesc":
      "이제 이 주소로 받은 팀 초대를 수락할 수 있습니다.",
    "team.verifyOpenTeams": "워크스페이스로 이동",
    "team.error.EMAIL_VERIFICATION_TOKEN_INVALID":
      "인증 링크가 올바르지 않습니다. 가장 최근에 받은 인증 메일의 링크를 열거나 인증 메일을 다시 받으세요.",
    "team.error.EMAIL_VERIFICATION_TOKEN_EXPIRED":
      "인증 링크가 만료되었습니다. 인증 메일을 다시 받아 최신 링크를 사용하세요.",
    "team.error.EMAIL_VERIFICATION_TOKEN_USED":
      "이미 사용한 링크입니다. 이메일 인증이 끝났으니 로그인해서 계속하세요.",
    "team.error.EMAIL_VERIFICATION_RATE_LIMITED":
      "인증 메일을 너무 많이 요청했습니다. 몇 분 뒤에 가장 최근에 받은 링크를 사용하세요.",
    "team.seatRequest":
      "워크스페이스 소유자({email})에게 좌석 추가를 요청하세요. 입력한 내용은 이 화면에 유지됩니다.",
    "team.seatRequestAction": "소유자에게 메일 보내기",
    "team.error.WORKSPACES_DISABLED":
      "이 환경에서는 팀 온보딩을 아직 사용할 수 없습니다. 개인 계정으로 계속 이용할 수 있습니다.",
    "team.error.WORKSPACES_UNREACHABLE":
      "팀 서비스에 연결하지 못했습니다. 계정과 개인 작업에는 영향이 없습니다. 잠시 후 다시 시도해주세요.",
    "team.error.WORKSPACES_EMPTY":
      "모든 계정에는 워크스페이스가 있으므로 이 목록이 비어 있을 수 없습니다. 아직 준비 중일 수 있으니 잠시 후 다시 시도해주세요.",
    "team.error.WORKSPACE_CREATE_LIMIT_REACHED":
      "이 계정에서 만들 수 있는 워크스페이스를 모두 만들었습니다. 이미 있는 워크스페이스를 사용하거나, 더 이상 쓰지 않는 곳에서 나가세요.",
    "team.error.WORKSPACE_CREATION_UNAVAILABLE":
      "워크스페이스 생성은 미리보기 대상 계정에 제공됩니다. 초대받았다면 이메일의 초대 링크를 열어주세요.",
    "team.error.WORKSPACE_NAME_INVALID":
      "1자 이상 80자 이하의 워크스페이스 이름을 입력하세요.",
    "team.error.WORKSPACE_NOT_FOUND":
      "워크스페이스를 찾을 수 없거나 접근 권한이 없습니다. 다른 워크스페이스를 선택하거나 개인 계정으로 계속하세요.",
    "team.error.WORKSPACE_ADMIN_REQUIRED":
      "소유자와 관리자만 초대를 관리할 수 있습니다.",
    "team.error.WORKSPACE_OWNER_REQUIRED":
      "관리자 초대와 관리는 소유자만 할 수 있습니다.",
    "team.error.WORKSPACE_SEAT_LIMIT":
      "남은 멤버 좌석이 없습니다. 워크스페이스 소유자에게 좌석 확보를 요청하세요.",
    "team.error.INVITATION_EMAIL_MISMATCH":
      "다른 이메일로 받은 초대입니다. 초대 메일을 받은 주소로 로그인해주세요.",
    "team.error.INVITATION_UNAVAILABLE":
      "유효하지 않은 초대 링크입니다. 새로 받은 초대가 있는지 확인하거나 관리자에게 재초대를 요청하세요.",
    "team.error.INVITATION_EXPIRED":
      "초대가 만료되었습니다. 워크스페이스 관리자에게 재초대를 요청하세요.",
    "team.error.INVITATION_REVOKED":
      "취소된 초대입니다. 워크스페이스 관리자에게 새 초대를 요청하세요.",
    "team.error.INVITATION_ALREADY_ACCEPTED":
      "이미 수락된 초대입니다. 새로고침해 현재 멤버 상태를 확인하세요.",
    "team.error.RATE_LIMIT": "요청이 많습니다. 잠시 후 다시 시도해주세요.",
    "team.error.REQUEST_FAILED":
      "요청을 완료하지 못했습니다. 이 화면의 입력은 유지됩니다. 연결을 확인하고 다시 시도해주세요.",
     "team.error.WORKSPACE_PERSONAL_INVITE_FORBIDDEN":
      "개인 공간에는 초대할 수 없습니다. 팀을 만들어 그곳으로 초대하세요. 개인 공간은 계속 나만의 공간으로 남습니다.",
    "team.error.WORKSPACE_PERSONAL_DELETE_FORBIDDEN":
      "개인 공간은 삭제할 수 없습니다. 계정마다 하나씩 있으며, 닫을 수 있는 팀이 아닙니다.",
    "team.error.WORKSPACE_PERSONAL_MEMBERS_FORBIDDEN":
      "개인 공간에는 관리할 멤버가 없습니다. 다른 사람과 함께 일해야 한다면 팀을 만드세요.",
    "team.error.WORKSPACE_PERSONAL_LEAVE_FORBIDDEN":
      "개인 공간은 탈퇴할 수 없습니다. 남겨 줄 사람이 없습니다.",
    "team.error.WORKSPACE_PERSONAL_TRANSFER_FORBIDDEN":
      "개인 공간은 다른 사람에게 넘길 수 없습니다. 다른 사람이 소유해야 한다면 작업을 팀으로 옮기세요.",
    "team.openPersonal": "내 공간 열기",
    "team.kind.personal": "개인 공간",
    "team.kind.team": "팀",
    "team.personalTitle": "내 개인 공간",
    "team.personalDesc":
      "나만 보는 공간입니다. 멤버도 좌석도 없습니다.",
    "team.personalOne":
      "여기가 내 공간입니다. 다른 사람과 함께 일할 때 팀을 만드세요. 개인 공간은 그대로 남습니다.",
    "team.personalNoTeams": "아직 참여한 팀이 없습니다.",
    "team.teamsHeading": "팀",
    "team.spaceHeading": "내 공간",
    "team.makeTeam": "팀 만들기",
    "team.personalNoMembers":
      "개인 공간에는 멤버도, 역할도, 초대도 없습니다. 누군가와 함께 일하려면 팀을 만들고 그곳으로 초대하세요.",
    "team.here": "현재 위치",
    "team.hereTeam": "여기서 하는 일은 이 팀에게 보입니다.",
    "team.herePersonal": "여기서 하는 일은 나에게만 보입니다.",
    "team.seatActive": "참여 중인 멤버",
    "team.seatInvited": "초대가 잡아둔 좌석",
    "team.seatSuspended": "참여 정지",
    "team.seatRemaining": "남은 좌석",
    "team.seatReviewers": "검토자",
    "team.seatHolds": "좌석을 차지함",
    "team.seatFree": "좌석을 차지하지 않음",
    "team.seatSplit":
      "수락 전 초대도 좌석을 잡습니다.",
    "team.capsTitle": "역할별로 할 수 있는 일",
    "team.capsHint":
      "역할은 할 수 있는 일의 상한입니다. 관리자는 자기 자신을 포함해 누구도 소유자로 올릴 수 없습니다.",
    "team.caps.billing": "결제·좌석·소유권 이전·팀 삭제",
    "team.caps.people": "초대·역할 변경·참여 정지·제거",
    "team.caps.projects": "원본 업로드·다운로드",
    "team.caps.publish": "앱에서 편집·버전 발행",
    "team.caps.comment": "리뷰 코멘트",
    "team.caps.seat": "유료 좌석 사용",
    "team.caps.yes": "가능",
    "team.caps.no": "불가",
    "team.caps.scoped": "범위 내",
    "team.caps.notOwner": "소유자 제외",
    "team.startPersonalTitle": "개인 공간이 준비되었습니다",
    "team.startPersonalBody":
      "다른 사람에게는 보이지 않습니다. 팀은 별도의 공간이고 언제든 만들 수 있습니다.",
    "team.startTeamName": "팀 이름",
    "team.startTeamHint":
      "회사, 스튜디오 또는 팀 이름을 사용하세요. 다음 단계에서 팀원을 초대할 수 있습니다.",
    "team.startNoTeam":
      "아직 팀이 없어서 초대할 사람도 없습니다. 위에서 팀을 만들거나, 그냥 계속 진행하세요.",
  },
};
