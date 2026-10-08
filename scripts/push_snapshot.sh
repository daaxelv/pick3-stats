#!/usr/bin/env bash
# Publish an already committed snapshot without overwriting concurrent collectors.
set -euo pipefail
: "${SNAPSHOT_BRANCH:?Set SNAPSHOT_BRANCH to the destination branch}"
for attempt in 1 2 3; do
  git fetch origin "refs/heads/$SNAPSHOT_BRANCH"
  remote_before=$(git rev-parse FETCH_HEAD)
  if ! git rebase "$remote_before"; then
    git rebase --abort
    echo "::error::Snapshot conflicts with newer changes; refusing to overwrite them."
    exit 1
  fi
  if git push origin "HEAD:refs/heads/$SNAPSHOT_BRANCH"; then
    exit 0
  fi
  git fetch origin "refs/heads/$SNAPSHOT_BRANCH"
  if [ "$(git rev-parse FETCH_HEAD)" = "$remote_before" ]; then
    echo "::error::Push failed without a concurrent branch update; check permissions or network."
    exit 1
  fi
  echo "Branch advanced during save; retrying ($attempt/3)."
done
echo "::error::Branch kept advancing during all three save attempts."
exit 1
