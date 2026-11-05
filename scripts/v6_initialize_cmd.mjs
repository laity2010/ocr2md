#!/usr/bin/env node
/** The engineering reset restores a *usable* CMD PBS mother document.
 * CLI stdout is exactly the source text; errors go to stderr, never stdout.
 * Conversion MUST reuse CMD's single parser/planner, not reimplement the
 * grammar in Python or modify the original immutable MinerU fixture.
 */
import {readFileSync} from 'node:fs';
import {planCMDMigrateLegacyBlockChains,readCMDBlockChains} from '../ui/cmd-block-chains.js';

const file=process.argv[2];
if(!file)throw Error('Require immutable initializer source file');
const before=readFileSync(file,'utf8');
if(Buffer.byteLength(before,'utf8')>8*1024*1024)
  throw Error('Initializer fixture is too large');
const initial=readCMDBlockChains(before);
if(initial.invalid.length)throw Error('Initializer fixture has invalid legacy CMD anchors');
const plan=planCMDMigrateLegacyBlockChains(before);
const upgraded=[...plan.edits].sort((a,b)=>b.from-a.from).reduce((text,edit)=>{
  if(text.slice(edit.from,edit.to)!==edit.expected)
    throw Error('Initializer CMD migration source changed');
  return text.slice(0,edit.from)+edit.insert+text.slice(edit.to);
},before);
const next=readCMDBlockChains(upgraded);
if(next.invalid.length||next.atoms.length!==initial.atoms.length||
  next.atoms.some((atom,i)=>atom.id!==initial.atoms[i].id||atom.format!=='cmd-v1'))
  throw Error('Initializer must produce a complete CMD PBS/BC document');
const tail='<!-- minerujson:source:v1:';
if(!before.includes(tail)||!upgraded.includes(tail)||
  upgraded.slice(upgraded.indexOf(tail))!==before.slice(before.indexOf(tail)))
  throw Error('Initializer changed immutable MinerU provenance');
process.stdout.write(upgraded);
