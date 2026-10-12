"use client";
import { useState, type ReactNode } from "react";
import { Download, Film, Grid2x2, List, Monitor, Moon, Plus, Sun, Trash2, Upload } from "lucide-react";
import {
  AvatarStack,
  Badge,
  Button,
  Card,
  CardFooter,
  CardHeader,
  DangerZone,
  EmptyState,
  Field,
  IconButton,
  InfoTip,
  inputClass,
  Kbd,
  MeterRow,
  Notice,
  PageHeader,
  ProgressTracker,
  Poster,
  PropertyList,
  SearchField,
  Segmented,
  Select,
  SettingRow,
  SettingsSection,
  StatStrip,
  SummaryRows,
  tableClass,
  tdClass,
  thClass,
  numClass,
  Timeline,
  Toolbar,
} from "@/components/ui";

const people = [
  { id: "a1", name: "김지훈" },
  { id: "b2", name: "박서연" },
  { id: "c3", name: "이도윤" },
  { id: "d4", name: "최민지" },
  { id: "e5", name: "정하늘" },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <p className="text-xs font-medium text-muted">{title}</p>
      {children}
    </section>
  );
}

function Sheet() {
  const [view, setView] = useState<"grid" | "list">("grid");
  const [filter, setFilter] = useState<"all" | "open">("all");
  const [theme, setTheme] = useState<"system" | "light" | "dark">("system");
  const [query, setQuery] = useState("");
  return (
    <div className="space-y-10">
      <PageHeader
        title="1차 편집 검토"
        back={{ href: "#", label: "영상 목록" }}
        badge={<Badge tone="warning" dot>승인 대기</Badge>}
        meta={["v2", "회차 1", "승인됨 · 김지훈"]}
        actions={
          <>
            <Button variant="secondary">
              <Download size={16} strokeWidth={1.75} /> 다운로드
            </Button>
            <Button>승인</Button>
          </>
        }
      />

      <Section title="Button · IconButton">
        <div className="flex flex-wrap items-center gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button disabled>Disabled</Button>
          <Button size="sm" variant="secondary">
            <Plus size={14} strokeWidth={2} /> sm
          </Button>
          <Button size="xs" variant="secondary">xs</Button>
          <IconButton label="삭제">
            <Trash2 size={16} strokeWidth={1.75} />
          </IconButton>
          <IconButton label="업로드" variant="secondary">
            <Upload size={16} strokeWidth={1.75} />
          </IconButton>
        </div>
      </Section>

      <Section title="InfoTip">
        <div className="flex flex-wrap items-center gap-6 text-sm">
          <span className="inline-flex items-center gap-1.5 font-medium">
            결제 정보
            <InfoTip label="저장한 정보는 어디에 쓰이나요?">
              <p>이미 만든 주문과 증빙은 당시 정보를 유지해요.</p>
            </InfoTip>
          </span>
          <InfoTip label="환불은 어떻게 처리되나요?" text="환불은 어떻게 처리되나요?">
            <p>요청하면 미사용분을 먼저 예약하고, 확인 뒤 원결제를 취소해요.</p>
          </InfoTip>
        </div>
      </Section>

      <Section title="Badge · Kbd · AvatarStack">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>외부</Badge>
          <Badge>v2</Badge>
          <Badge tone="success" dot>승인됨</Badge>
          <Badge tone="warning" dot>좌석 대기</Badge>
          <Badge tone="danger" dot>결제 실패</Badge>
          <Kbd>⌘K</Kbd>
          <Kbd>J</Kbd>
          <AvatarStack people={people} max={4} />
        </div>
      </Section>

      <Section title="Segmented · Search · Select">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="보기"
            value={view}
            onChange={setView}
            iconOnly
            options={[
              { value: "grid", label: "그리드", icon: Grid2x2 },
              { value: "list", label: "목록", icon: List },
            ]}
          />
          <Segmented
            label="필터"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "전체" },
              { value: "open", label: "미해결 3" },
            ]}
          />
          <Segmented
            label="테마"
            value={theme}
            onChange={setTheme}
            iconOnly
            options={[
              { value: "system", label: "시스템", icon: Monitor },
              { value: "light", label: "라이트", icon: Sun },
              { value: "dark", label: "다크", icon: Moon },
            ]}
          />
          <SearchField value={query} onChange={setQuery} placeholder="검색" label="검색" className="sm:w-56" />
          <Select aria-label="정렬" size="sm" wrapperClassName="w-36" defaultValue="new">
            <option value="new">최신순</option>
            <option value="name">이름순</option>
          </Select>
        </div>
      </Section>

      <Section title="StatStrip · MeterRow">
        <StatStrip
          items={[
            { label: "남은 AI 처리 시간", value: "38분", unit: "/ 1시간", foot: <MeterRow label="" value="" percent={63} /> },
            { label: "플랜", value: "Free" },
            { label: "이번 달 영상", value: 3, foot: "3개 완료" },
          ]}
        />
        <Card>
          <div className="space-y-4">
            <MeterRow label="저장 공간" value="12 / 50 GB" percent={24} />
            <MeterRow label="편집 좌석" value="5 / 5" percent={100} foot="좌석이 모두 찼어요" />
          </div>
        </Card>
      </Section>

      <Section title="Card · PropertyList · SummaryRows · Timeline">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="결제 정보" description="매월 12일 자동결제" action={<Button size="sm" variant="secondary">관리</Button>} divider />
            <PropertyList
              divided
              items={[
                ["플랜", "Business"],
                ["좌석", "5석"],
                ["다음 결제일", "11월 12일"],
                ["결제수단", "VISA •••• 4242"],
              ]}
            />
            <CardFooter>
              <span>변경 사항이 없어요</span>
              <Button size="sm" disabled>저장</Button>
            </CardFooter>
          </Card>
          <Card>
            <CardHeader title="결제 내용" />
            <SummaryRows
              rows={[
                ["129,000원 × 3석", "387,000원"],
                ["부가세 10%", "38,700원"],
              ]}
              total={["합계", "425,700원"]}
            />
          </Card>
          <Card>
            <CardHeader title="주문 내역" count={3} />
            <Timeline
              items={[
                { title: "결제 완료", time: "10월 12일", tone: "success", body: "VISA •••• 4242" },
                { title: "좌석 2석 추가", time: "10월 5일" },
                { title: "카드 승인 실패", time: "10월 1일", tone: "danger", body: "한도 초과" },
              ]}
            />
          </Card>
          <Card>
            <CardHeader title="입력" />
            <div className="space-y-4">
              <Field label="이메일" htmlFor="kit-email" help="초대 메일을 보내요">
                <input id="kit-email" className={inputClass} placeholder="name@example.com" />
              </Field>
              <Field label="비밀번호" htmlFor="kit-pw" aside={<a className="text-muted underline" href="#">비밀번호를 잊으셨나요?</a>} error="8자 이상 입력해 주세요">
                <input id="kit-pw" type="password" className={inputClass} />
              </Field>
            </div>
          </Card>
        </div>
      </Section>

      <Section title="Notice">
        <div className="space-y-2">
          <Notice>평범한 안내 한 줄이에요.</Notice>
          <Notice tone="success">결제가 완료됐어요.</Notice>
          <Notice tone="warning" title="좌석 대기 1명" action={<Button size="sm" variant="secondary">좌석 추가</Button>}>
            결제하면 바로 편집할 수 있어요.
          </Notice>
          <Notice tone="danger" role="alert">요청을 완료하지 못했어요.</Notice>
        </div>
      </Section>

      <Section title="Toolbar · Table">
        <Toolbar title="멤버" count={4}>
          <SearchField value="" onChange={() => {}} placeholder="이름, 이메일" label="검색" className="sm:w-56" />
          <Button size="sm">
            <Plus size={14} strokeWidth={2} /> 초대
          </Button>
        </Toolbar>
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>이름</th>
              <th className={thClass}>역할</th>
              <th className={`${thClass} ${numClass}`}>금액</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["김지훈", "소유자", "129,000원"],
              ["박서연", "편집자", "129,000원"],
              ["이도윤", "뷰어", "0원"],
            ].map(([name, role, amount]) => (
              <tr key={name}>
                <td className={tdClass}>{name}</td>
                <td className={tdClass}>
                  <Badge>{role}</Badge>
                </td>
                <td className={`${tdClass} ${numClass}`}>{amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Poster">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <Poster duration={6} badge={<Badge tone="warning" dot>승인 요청</Badge>} />
            <p className="mt-2 text-[13px] font-medium">1차 편집 검토</p>
            <p className="text-xs text-muted">브랜드 캠페인 30초 · 6분 전</p>
          </div>
          <div>
            <Poster />
            <p className="mt-2 text-[13px] font-medium">유튜브 쇼츠 10월</p>
            <p className="text-xs text-muted">영상 없음</p>
          </div>
        </div>
      </Section>

      <Section title="ProgressTracker (affectUI)">
        <Tracker />
      </Section>

      <Section title="EmptyState">
        <div className="grid gap-4 sm:grid-cols-2">
          <EmptyState icon={Film} title="아직 영상이 없어요" description="데스크톱 앱에서 공유하면 여기에 보여요." />
          <EmptyState frame="dashed" icon={Upload} title="파일을 끌어다 놓으세요" action={<Button size="sm" variant="secondary">파일 선택</Button>} />
        </div>
      </Section>

      <Section title="SettingsSection · SettingRow · DangerZone">
        <SettingsSection title="환경" description="이 기기와 계정에 적용돼요." footer={<><span>변경 사항이 없어요</span><Button size="sm" disabled>저장</Button></>}>
          <SettingRow label="언어" description="화면에 쓰는 언어">
            <Segmented label="언어" value="ko" onChange={() => {}} options={[{ value: "ko", label: "한국어" }, { value: "en", label: "English" }]} />
          </SettingRow>
          <SettingRow label="테마">
            <Segmented label="테마" value="system" onChange={() => {}} iconOnly options={[{ value: "system", label: "시스템", icon: Monitor }, { value: "light", label: "라이트", icon: Sun }, { value: "dark", label: "다크", icon: Moon }]} />
          </SettingRow>
        </SettingsSection>
        <DangerZone title="위험 구역">
          <SettingRow label="팀 삭제" description="모든 프로젝트와 파일이 삭제돼요.">
            <Button variant="danger" size="sm">팀 삭제</Button>
          </SettingRow>
        </DangerZone>
      </Section>
    </div>
  );
}

function Tracker() {
  const [done, setDone] = useState<string[]>(["open"]);
  const toggle = (id: string) =>
    setDone((was) => (was.includes(id) ? was.filter((d) => d !== id) : [...was, id]));
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <ProgressTracker
        title="시작하기"
        current="profile"
        steps={[
          { id: "account", label: "계정 만들기", done: true },
          { id: "use", label: "사용 방식", done: true },
          { id: "profile", label: "하는 일" },
          { id: "workspace", label: "워크스페이스 이름" },
          { id: "app", label: "앱 설치" },
        ]}
      />
      <ProgressTracker
        title="첫 컷까지"
        onToggle={toggle}
        steps={[
          { id: "open", label: "Prepix를 열고 로그인하기", hint: "같은 이메일이나 Google 계정으로 로그인해요." },
          { id: "project", label: "새 프로젝트 만들기", hint: "영상에 맞는 편집 방식을 골라요." },
          { id: "import", label: "짧은 영상 불러오기" },
          { id: "cut", label: "첫 컷 편집하기" },
        ].map((s) => ({ ...s, done: done.includes(s.id) }))}
      />
    </div>
  );
}

export function Catalogue() {
  return (
    <div className="grid min-h-dvh xl:grid-cols-2">
      {(["light", "dark"] as const).map((theme) => (
        <div key={theme} data-theme={theme} className={`${theme} bg-background p-6 text-foreground sm:p-10`}>
          <Sheet />
        </div>
      ))}
    </div>
  );
}
