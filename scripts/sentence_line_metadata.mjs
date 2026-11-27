import {readFileSync} from 'node:fs';
import {mdlineTypes} from '../ui/sentence/mdline-attributes.js';
process.stdout.write(JSON.stringify(mdlineTypes(JSON.parse(readFileSync(0,'utf8')))));
