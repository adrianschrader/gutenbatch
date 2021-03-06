#!/usr/bin/env node
const Promise = require('bluebird');
const request = require('request-promise');
const cheerio = require('cheerio'); // Basically jQuery for node.js
const path = require('path');
const fs = require('fs');
const url = require('url');
const merge = require('pdf-merge');

/* Downloads a file from the uri with streams and returns a promise */
const downloadFile = (uri, filename, jar) => new Promise((resolve, reject) => {
  fs.stat(filename, function(err, stat) {
    if (err == null)
      // Do not override, but skip preexisting files
      resolve();
    else {
      request(uri, { jar })
      .pipe(fs.createWriteStream(filename))
      .on('finish', () => {
        resolve();
      });
    }
  });
});

/* Creates the temporary directory if it not already exists */
const ensureOutDir = (dir) => {
  const outputDir = path.resolve(dir);
  if (!fs.existsSync(outputDir)){
    fs.mkdirSync(outputDir);
    console.log('Created temporary output directory in ' + outputDir);
  }
}

module.exports = (settings) => {
  ensureOutDir(settings.output);
  console.log('Loading metadata for pdf files...');

  // Create new cookie jar for all requests
  const jar = request.jar();
  jar.setCookie('ERIGHTS=' + settings.auth, settings.host);

  // Responses are automatically serialized by cheerio (jQuery for servers).
  const options = {
    uri: settings.source,
    transform: (body) => cheerio.load(body),
    jar
  };

  // Get HTML page from the Thieme server
  request(options)
  .then(function ($) {
    // Extract only the PDF links, not other HTML files
    const links = $('li.option a').map(
      (i, el) => $(el).html().includes('PDF') ? settings.host + $(el).attr('href') : undefined
    ).get();

    // Download all files into the temp directory
    return Promise.reduce(links, (paths, link) => {
      // Filenames are generated from the url
      const filename = url.parse(link).pathname.split('/').pop();
      const filepath = path.resolve(settings.output + '/' + filename);
      paths.push(filepath);

      console.log('Downloading %s (%s/%s)...', filename, paths.length, links.length);
      return downloadFile(link, filepath, jar).then(() => paths);
    }, []);
  })
  .then((paths) => {
    console.log('Merging %s pdf files...', paths.length);

    // Merge pdf files with pdftk server cli as a dependency
    return merge(paths, { output: path.resolve(settings.output + '/' + settings.mergedFile) }).then(() =>
      console.log('Success!')
    );
  })
  // Display all errors in the Commandline. No handling at this point
  .catch(console.error);
};
