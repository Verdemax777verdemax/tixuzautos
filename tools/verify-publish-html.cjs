#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const sourceBytes = 75_930;
const allowedDeltaBytes = 2_048;
const target = path.resolve(process.cwd(), process.argv[2] || 'index.html');
const bytes = fs.readFileSync(target);
const html = bytes.toString('utf8');
const count = pattern => (html.match(pattern) || []).length;

const checks = {
  file: target,
  bytes: bytes.length,
  scriptOpen: count(/<script\b/gi),
  scriptClose: count(/<\/script>/gi),
  styleOpen: count(/<style\b/gi),
  styleClose: count(/<\/style>/gi),
  firstStyle: html.indexOf('<style'),
  firstRoot: html.indexOf(':root{'),
  carriageReturns: [...bytes].filter(byte => byte === 13).length,
};

const failures = [];
if (checks.scriptOpen !== checks.scriptClose) failures.push(`script imbalance: ${checks.scriptOpen}/${checks.scriptClose}`);
if (checks.styleOpen !== checks.styleClose) failures.push(`style imbalance: ${checks.styleOpen}/${checks.styleClose}`);
if (checks.firstStyle < 0 || checks.firstRoot < 0 || checks.firstStyle >= checks.firstRoot) failures.push('first <style> must precede first :root{');
if (checks.carriageReturns !== 0) failures.push(`found ${checks.carriageReturns} carriage return(s)`);
if (Math.abs(checks.bytes - sourceBytes) > allowedDeltaBytes) failures.push(`size ${checks.bytes} is outside ${sourceBytes} +/- ${allowedDeltaBytes} bytes`);

console.log(JSON.stringify(checks));
if (failures.length) {
  console.error(`HTML publish preflight failed: ${failures.join('; ')}`);
  process.exit(1);
}

console.log('HTML publish preflight passed.');
