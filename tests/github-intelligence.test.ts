import { describe,expect,it } from "vitest";
import { ingestCommitSnapshot,ingestPullRequestSnapshot,ingestRepositorySnapshot } from "../src/github-intelligence.js";
describe("GitHub intelligence",()=>{
 it("captures repository metadata",()=>{const e=ingestRepositorySnapshot({fullName:"org/repo",defaultBranch:"main",visibility:"public"});expect(e.data).toMatchObject({repository:"org/repo",defaultBranch:"main",visibility:"public"});});
 it("captures commit identity",()=>{const e=ingestCommitSnapshot("org/repo",{sha:"abc",message:"fix: bug",author:"agent"});expect(e.id).toBe("github:commit:org/repo:abc");});
 it("captures PR lifecycle and review state",()=>{const e=ingestPullRequestSnapshot("org/repo",{number:7,title:"Add feature",state:"closed",merged:true,baseSha:"base",headSha:"head",additions:40,deletions:10,changedFiles:5,createdAt:"2026-10-08T00:00:00.000Z",reviewDecision:"approved"});expect(e.data).toMatchObject({merged:true,changedFiles:5,reviewDecision:"approved"});});
});
