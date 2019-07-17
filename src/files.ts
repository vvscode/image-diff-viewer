import * as Path from "path";
import * as glob from "glob";
import * as png from "./image-diff";
import * as rectangles from "./rectangles";
import { FilePairs, FilePair, FileDiff, DiffResultGroup } from "./types";
import * as crypto from "crypto";
import * as fs from "fs";
import { Png } from "./png";

export function getFilePairs(file1: string, file2: string): FilePairs {
  const name1 = `${Path.relative(".", file1)}`;
  const name2 = `${Path.relative(".", file2)}`;
  return {
    [`${name1} - ${name2}`]: {
      left: file1,
      right: file2
    }
  };
}

export function getFilePairsRecursively(dir1: string, dir2: string): FilePairs {
  const pattern = "**/*.png";
  const filePairs: FilePairs = {};
  collectFilePairs(filePairs, pattern, dir1, "left");
  collectFilePairs(filePairs, pattern, dir2, "right");
  return filePairs;
}

function collectFilePairs(
  filePairs: FilePairs,
  pattern: string,
  dir: string,
  field: "left" | "right"
): void {
  const files = glob.sync(pattern, {
    cwd: dir
  });
  for (let file of files) {
    filePairs[file] = filePairs[file] || {};
    filePairs[file][field] = Path.resolve(dir, file);
  }
}

export async function compareFile(
  info: FilePair,
  clusters: number,
  padding: number,
  advanced: boolean,
  threshold: number
): Promise<FileDiff> {
  let leftName = "nothing";
  let rightName = "nothing";
  if (info.left) {
    leftName = Path.basename(info.left);
  }
  if (info.right) {
    rightName = Path.basename(info.right);
  }
  if (info.left && info.right && leftName === rightName) {
    leftName = Path.relative(".", info.left);
    rightName = Path.relative(".", info.right);
  }
  console.log("comparing " + leftName + " and " + rightName);
  if (info.left && info.right && isHashEqual(info.left, info.right)) {
    console.log("hash matched");
    return new FileDiff(null, null, { left: [], right: [] });
  }
  const left = info.left ? new Png(info.left) : null;
  const right = info.right ? new Png(info.right) : null;
  const leftInfo = info.left && {
    path: info.left,
    width: left.width,
    height: left.height
  };
  const rightInfo = info.right && {
    path: info.right,
    width: right.width,
    height: right.height
  };

  let results: DiffResultGroup[] = [];
  if (left && right) {
    console.log(`  left: ${leftInfo.width} * ${leftInfo.height}`);
    console.log(`  right: ${rightInfo.width} * ${rightInfo.height}`);
    let start = Date.now();
    results = png.compareImage(left, right, advanced, threshold);
    console.log("  took " + (Date.now() - start) + " ms to compare");
  }
  const change = {
    left: leftInfo,
    right: rightInfo,
    results
  };
  const start = Date.now();
  const rectsLR = await rectangles.getRects(change, clusters, padding);
  console.log("  took " + (Date.now() - start) + " ms to get rectangles");
  return new FileDiff(change.left, change.right, rectsLR);
}

function isHashEqual(left: string, right: string): boolean {
  return md5file(left) === md5file(right);
}

function md5file(filePath: string) {
  const target = fs.readFileSync(filePath);
  const md5hash = crypto.createHash("md5");
  md5hash.update(target);
  return md5hash.digest("hex");
}
