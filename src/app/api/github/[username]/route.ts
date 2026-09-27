type GitHubUser = { login: string; name: string | null; avatar_url: string; bio: string | null; html_url: string; public_repos: number; followers: number; location: string | null };
type GitHubRepo = { id: number; name: string; description: string | null; html_url: string; language: string | null; stargazers_count: number; fork: boolean };

export async function GET(_request: Request, context: { params: Promise<{ username: string }> }) {
  const { username: rawUsername } = await context.params;
  const username = rawUsername.trim();
  if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(username)) {
    return Response.json({ error: "Enter a valid GitHub username." }, { status: 422 });
  }
  const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "HireTrack-Campus-Placement-Demo" };
  try {
    const profileResponse = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, { headers, next: { revalidate: 1800 } });
    if (profileResponse.status === 404) return Response.json({ error: "That GitHub profile could not be found." }, { status: 404 });
    if (!profileResponse.ok) return Response.json({ error: profileResponse.status === 403 ? "GitHub’s public API limit has been reached. Please try again later." : "GitHub could not return this profile." }, { status: profileResponse.status === 403 ? 429 : 502 });
    const user = await profileResponse.json() as GitHubUser;
    const reposResponse = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=updated&per_page=100&type=owner`, { headers, next: { revalidate: 1800 } });
    const repositories: GitHubRepo[] = reposResponse.ok ? await reposResponse.json() : [];
    const topRepositories = repositories.filter((repo) => !repo.fork).sort((a, b) => b.stargazers_count - a.stargazers_count).slice(0, 5).map(({ id, name, description, html_url, language, stargazers_count }) => ({ id, name, description, url: html_url, language, stars: stargazers_count }));
    return Response.json({ data: { username: user.login, name: user.name, avatarUrl: user.avatar_url, bio: user.bio, profileUrl: user.html_url, publicRepos: user.public_repos, followers: user.followers, location: user.location, topRepositories } }, { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600" } });
  } catch {
    return Response.json({ error: "Could not reach GitHub right now." }, { status: 502 });
  }
}
