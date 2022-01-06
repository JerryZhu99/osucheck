const tf = require("@tensorflow/tfjs-node");
const nsfw = require("nsfwjs");
const path = require("path");
const { promises: fs } = require("fs");



const htmlTemplate = (template, results) => {
    return template.replace('{{results}}', results.map(e => `<a href="file://${e.image}"><div class="grid-item"><div class="rating">${(100 * e.result.Hentai).toFixed(2)}%</div><img src="file://${e.image}" /></div></a>`).join(''));
}


async function fn() {
  const rootDir = process.argv[2] ?? process.cwd();
  const songsDir = path.resolve(rootDir, "Songs");

  const mapDirs = await fs.readdir(songsDir, {
    encoding: "utf-8",
    withFileTypes: true,
  });
  let osuFiles = [];

  for (let dir of mapDirs) {
    if (!dir.isDirectory()) continue;
    const mapDir = path.resolve(songsDir, dir.name);
    const files = await fs.readdir(mapDir, {
      encoding: "utf-8",
    });

    osuFiles.push(
      ...files
        .filter((f) => f.endsWith(".osu"))
        .map((f) => [mapDir, path.resolve(mapDir, f)])
    );
  }
  let imageFiles = new Set();

  for (let [mapDir, osuFile] of osuFiles) {
    const fileData = await fs.readFile(osuFile, { encoding: "utf-8" });
    const images =
      [
        ...fileData.matchAll(
          /\/\/Background and Video events[^\/"]*"([^"]*.(?:jpg|jpeg|png))"/gi
        ),
      ].map((e) => e[1]) || [];
    images
      .map((i) => path.resolve(mapDir, i))
      .forEach(imageFiles.add, imageFiles);
  }

  console.log(`Found ${imageFiles.size} images`);

  const model = await nsfw.load(`file://${path.resolve(__dirname, 'nsfwjs')}/`, { size: 299 });

  const results = [];
  let i = 0;
  for (let imageFile of imageFiles) {
    i++;
    console.log(`Processing image ${i} of ${imageFiles.size}`);
    try {
      const pic = await fs.readFile(imageFile);
      const image = await tf.node.decodeImage(pic, 3);
      const predictions = await model.classify(image);
      image.dispose();
      const result = {
        image: imageFile,
        result: Object.fromEntries(
          predictions.map((e) => [e.className, e.probability])
        ),
      };
      results.push(result);
    } catch (e) {
      console.error(e);
    }
    // if (i > 100) break; // TODO: Remove
  }

  results.sort((a, b) => b.result.Hentai - a.result.Hentai);
  console.log(results.map(e => `${(100 * e.result.Hentai).toFixed(2)}%: ${e.image}`).join('\n'));

  const template = await fs.readFile(path.resolve(__dirname, 'index.html'), {encoding:'utf-8'});
  const output = htmlTemplate(template, results);

  fs.writeFile('results.html', output);
}
fn();
