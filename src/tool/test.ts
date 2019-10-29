import chalk from 'chalk'
import nexline from 'nexline'
import * as fs from 'fs'
import { MonoBehaviour } from '../mono/parser'

const input = 'resources/master/CharaRarity.txt'

async function boot() {
  const fd = fs.openSync(input, 'r')
  const reader = nexline({
    input: fd
  })
  
  const x = await MonoBehaviour.parse(reader, -1, {})
  if (x !== 'EOP') {
    console.log(chalk.green(JSON.stringify(x, null, 4)))
  }
  
}

boot()
