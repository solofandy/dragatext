import chalk from 'chalk'
import nexline from 'nexline'
import * as fs from 'fs'
import { MonoToken, MonoBehaviourText, MonoTraversalStack, MonoTokenType, stackParent, MonoObjectToken } from '../mono'
import { listDirectory, fielExists, saveTo } from '../helper/helper'
import { inputPath, dbPath } from '../../config'
import { basename } from 'path'
import { DB_WHITE_LIST, TEXT_LABEL_TXT } from '../../should-parse-to-db'

const DB_FILE = 'output/db/dragatext.sqlite'
const WHITE_LIST: string[] = DB_WHITE_LIST || []

const option = {
  only: process.argv.includes('--only') || false
}

const dbHolder = dbPath
const inputHolder = inputPath

let labelSize: number = 0
const labels: { [name: string]: string } = {}

const onTokenParseEnd = async (token: MonoToken, stack: MonoTraversalStack) => {
  const isTextEntity = (t: MonoToken | null) => {
    return !!t && t.type === MonoTokenType.OBJECT && t.mono === 'data'
  }
  
  if (token.type == MonoTokenType.STRING && 
    (token.key === 'Id' || token.key === 'Text')
  ) {
    const parent = stackParent(token, stack)
    if (isTextEntity(parent)) {
      (parent as MonoObjectToken).value[token.key] = token
    }
  }
  else if (isTextEntity(token) && !MonoBehaviourText.isEmptyObjectToken(token)) {
    labelSize += 1
    const id = (token as MonoObjectToken).value.Id.value as string
    const text = (token as MonoObjectToken).value.Text.value as string
    labels[id] = text
  }
}


async function traversalText(file: string) {
  console.log(`\ntraversaling ${chalk.green(file)} ...`)
  const filebase = basename(file).toLowerCase()
  const fd = fs.openSync(file, 'r')
  const reader = nexline({input: fd})
  const lines = await MonoBehaviourText.traversal(reader, undefined, onTokenParseEnd)
  fs.closeSync(fd)
  
  console.log(`parsed #${lines}, find ${labelSize} strings`)
}


async function boot () {

  await traversalText(`${inputHolder}/${TEXT_LABEL_TXT}`)
  
}

boot()
