// October 21, 2026 Node security release. Only the project's supported LTS
// lines are admitted. This is a minimum-version check, not publisher identity,
// a future-vulnerability guarantee, an installer or permission to deploy.
export function nodeSecurityBaselineSatisfied(version){
  if(typeof version!=="string"||version!==version.trim()||!/^(?:22|24)\.(?:0|[1-9][0-9]{0,2})\.(?:0|[1-9][0-9]{0,2})$/.test(version))return false;
  const [major,minor,patch]=version.split(".").map(Number),floor=major===22?[23,4]:[22,1];
  return minor>floor[0]||minor===floor[0]&&patch>=floor[1];
}
export function assertNodeSecurityBaseline(version=process.versions.node){
  if(!nodeSecurityBaselineSatisfied(version))throw new Error("PROJECT_NODE_SECURITY_BASELINE_REQUIRED");
}
