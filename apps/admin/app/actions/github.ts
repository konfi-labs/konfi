"use server";

import { isGitHubIssueReportingEnabled } from ".";
import { cacheLife, cacheTag, updateTag } from "next/cache";

const GITHUB_ISSUES_TAG = "admin-github-issues";

/**
 * GitHub Issue type from the GitHub API
 */
type GitHubIssueAssignee = {
  login: string;
  avatar_url?: string | null;
  html_url?: string;
};

type GitHubIssueReactions = {
  eyes?: number;
};

type GitHubIssue = {
  id: number;
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  state: string;
  created_at: string;
  updated_at: string;
  assignees?: GitHubIssueAssignee[];
  reactions?: GitHubIssueReactions;
};

/**
 * GitHub API search response
 */
type GitHubSearchResponse = {
  total_count: number;
  items: GitHubIssue[];
};

/**
 * List active GitHub issues for the configured repository
 * @returns Array of active issues or null on error
 */
export async function listGitHubIssues(): Promise<GitHubIssue[] | null> {
  try {
    await isGitHubIssueReportingEnabled();
    return await listGitHubIssuesCached();
  } catch (error) {
    console.error("Error listing GitHub issues:", error);
    return null;
  }
}

async function listGitHubIssuesCached(): Promise<GitHubIssue[] | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag(GITHUB_ISSUES_TAG);

  try {
    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_REPO_OWNER;
    const repo = process.env.GITHUB_REPO_NAME;

    if (!token || !owner || !repo) {
      throw new Error("GitHub configuration is incomplete");
    }

    const searchQuery = encodeURIComponent(
      `repo:${owner}/${repo} is:issue is:open`,
    );
    const url = `https://api.github.com/search/issues?q=${searchQuery}&per_page=5&sort=updated&order=desc`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(
        `GitHub API error: ${response.status} ${response.statusText}`,
        text,
      );
      return null;
    }

    const data: GitHubSearchResponse = await response.json();
    return data.items || [];
  } catch (error) {
    console.error("Error listing GitHub issues:", error);
    return null;
  }
}

/**
 * Search for existing GitHub issues to find potential duplicates
 * @param query - Search query string
 * @returns Array of matching issues or null on error
 */
export async function searchGitHubIssues(
  query: string,
): Promise<GitHubIssue[] | null> {
  try {
    await isGitHubIssueReportingEnabled();

    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_REPO_OWNER;
    const repo = process.env.GITHUB_REPO_NAME;

    if (!token || !owner || !repo) {
      throw new Error("GitHub configuration is incomplete");
    }

    // Use GitHub Search API to find issues
    const searchQuery = encodeURIComponent(
      `${query} repo:${owner}/${repo} is:issue`,
    );
    const url = `https://api.github.com/search/issues?q=${searchQuery}&per_page=5&sort=relevance`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(
        `GitHub API error: ${response.status} ${response.statusText}`,
        text,
      );
      return null;
    }

    const data: GitHubSearchResponse = await response.json();
    return data.items || [];
  } catch (error) {
    console.error("Error searching GitHub issues:", error);
    return null;
  }
}

/**
 * Create a new GitHub issue
 * @param title - Issue title
 * @param body - Issue body/description
 * @returns Created issue object or null on error
 */
export async function createGitHubIssue(
  title: string,
  body: string,
): Promise<GitHubIssue | null> {
  try {
    await isGitHubIssueReportingEnabled();

    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_REPO_OWNER;
    const repo = process.env.GITHUB_REPO_NAME;

    if (!token || !owner || !repo) {
      throw new Error("GitHub configuration is incomplete");
    }

    if (!title || title.trim().length === 0) {
      throw new Error("Issue title is required");
    }

    const url = `https://api.github.com/repos/${owner}/${repo}/issues`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: title.trim(),
        body: body.trim(),
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(
        `GitHub API error: ${response.status} ${response.statusText}`,
        text,
      );
      return null;
    }

    const issue: GitHubIssue = await response.json();
    updateTag(GITHUB_ISSUES_TAG);
    return issue;
  } catch (error) {
    console.error("Error creating GitHub issue:", error);
    return null;
  }
}
