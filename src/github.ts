export type Day = { date: string; count: number; level: 0 | 1 | 2 | 3 | 4; weekday: number };
export type Calendar = {
  login: string;
  name: string | null;
  location: string | null;
  company: string | null;
  bio: string | null;
  pinned: string[];
  recent: string[];
  languages: string[];
  total: number;
  weeks: Day[][];
};

const LEVEL: Record<string, Day["level"]> = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };

const QUERY = `query($login:String!){user(login:$login){login name location company bio pinnedItems(first:6,types:REPOSITORY){nodes{...on Repository{name}}} repositories(first:30,ownerAffiliations:OWNER,isFork:false,orderBy:{field:PUSHED_AT,direction:DESC}){nodes{name primaryLanguage{name}}} contributionsCollection{contributionCalendar{totalContributions weeks{contributionDays{date contributionCount contributionLevel weekday}}}}}}`;

// Prefers GITHUB_TOKEN, falling back to the local gh CLI session.
const resolveToken = async () => {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  const gh = Bun.spawnSync(["gh", "auth", "token"]);
  const token = gh.stdout.toString().trim();
  if (gh.exitCode !== 0 || !token) throw new Error("Set GITHUB_TOKEN or log in with `gh auth login`.");
  return token;
};

// Languages of recently pushed repos, most common first.
const rankLanguages = (repos: any[]) => {
  const counts = new Map<string, number>();
  for (const r of repos) if (r.primaryLanguage) counts.set(r.primaryLanguage.name, (counts.get(r.primaryLanguage.name) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).map(([name]) => name);
};

export const fetchCalendar = async (login: string): Promise<Calendar> => {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${await resolveToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: QUERY, variables: { login } }),
  });
  const json: any = await res.json();
  if (!res.ok || json.errors) throw new Error(`GitHub API: ${JSON.stringify(json.errors ?? json)}`);
  const user = json.data.user;
  if (!user) throw new Error(`User not found: ${login}`);
  const cal = user.contributionsCollection.contributionCalendar;
  const repos = user.repositories.nodes;
  return {
    login: user.login,
    name: user.name,
    location: user.location,
    company: user.company,
    bio: user.bio,
    pinned: user.pinnedItems.nodes.map((r: any) => r.name),
    recent: repos.map((r: any) => r.name),
    languages: rankLanguages(repos),
    total: cal.totalContributions,
    weeks: cal.weeks.map((w: any) =>
      w.contributionDays.map((d: any) => ({
        date: d.date,
        count: d.contributionCount,
        level: LEVEL[d.contributionLevel],
        weekday: d.weekday,
      })),
    ),
  };
};
