import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
createServer((q, r) => { r.setHeader('content-type', 'text/html; charset=utf-8'); r.end(readFileSync('./kokpit-preview.html')) }).listen(5179)
