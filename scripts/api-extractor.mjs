import { Extractor, ExtractorConfig } from '@microsoft/api-extractor';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJsonFullPath = path.join(projectFolder, 'package.json');
const localBuild = process.argv.includes('--local');
const rollupOnly = process.argv.includes('--rollup-only');
const verbose = process.argv.includes('--verbose');
const declarationFolder = 'temp/declarations';
const rollupFolder = 'dist';

const entryPoints = [
  ['galaxy-nodes', 'index.d.ts'],
  ['galaxy-nodes-core', 'core.d.ts'],
  ['galaxy-nodes-react', 'react.d.ts'],
  ['galaxy-nodes-vue', 'vue.d.ts'],
  ['galaxy-nodes-angular', 'angular.d.ts'],
];

let failed = false;

for (const [reportName, entryPoint] of entryPoints) {
  const extractorConfig = ExtractorConfig.prepare({
    configObject: {
      projectFolder,
      mainEntryPointFilePath: `<projectFolder>/${declarationFolder}/${entryPoint}`,
      newlineKind: 'lf',
      compiler: {
        tsconfigFilePath: '<projectFolder>/tsconfig.build.json',
        skipLibCheck: true,
      },
      apiReport: {
        enabled: !rollupOnly,
        reportFileName: reportName,
        reportFolder: '<projectFolder>/etc',
        reportTempFolder: '<projectFolder>/temp/api-extractor',
      },
      docModel: {
        enabled: false,
      },
      dtsRollup: {
        enabled: true,
        untrimmedFilePath: `<projectFolder>/${rollupFolder}/${entryPoint}`,
      },
      tsdocMetadata: {
        enabled: false,
      },
      messages: {
        extractorMessageReporting: {
          'ae-missing-release-tag': {
            logLevel: 'none',
          },
          'ae-unresolved-link': {
            logLevel: 'warning',
            addToApiReportFile: true,
          },
        },
        tsdocMessageReporting: {
          default: {
            logLevel: 'warning',
          },
        },
      },
    },
    configObjectFullPath: undefined,
    packageJsonFullPath,
  });

  const result = Extractor.invoke(extractorConfig, {
    localBuild,
    printApiReportDiff: true,
    showVerboseMessages: verbose,
    typescriptCompilerFolder: path.join(projectFolder, 'node_modules/typescript'),
  });

  if (!result.succeeded) failed = true;
}

if (failed) {
  process.exitCode = 1;
}
