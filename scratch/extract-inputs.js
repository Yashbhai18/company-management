const fs = require('fs');
const readline = require('readline');

async function extract() {
  const fileStream = fs.createReadStream('C:\\Users\\shata\\.gemini\\antigravity-ide\\brain\\d00e0ab1-bf4c-48e3-8cd7-e29a17e304cb\\.system_generated\\logs\\transcript.jsonl');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    try {
      const obj = JSON.parse(line);
      if (obj.type === 'USER_INPUT') {
        console.log(`[USER_INPUT] Step ${obj.step_index}: ${JSON.stringify(obj.content)}`);
      }
    } catch (err) {
      // ignore
    }
  }
}

extract();
