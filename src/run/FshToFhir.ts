import { RawFSH } from '../import';
import { exportFHIR } from '../export';
import { FHIRDefinitions } from '../fhirdefs';
import { ImplementationGuideDependsOn } from '../fhirtypes';
import {
  fillTank,
  loadExternalDependencies,
  logger,
  errorsAndWarnings,
  ErrorsAndWarnings
} from '../utils';

/**
 * This function can be used to process input string(s) containing FSH definitions into JSON.
 * NOTE: This function is not safe for true asynchronous usage. If two calls of this function are running at once, the error and warnings reported
 * will be inconsistent. Always ensure a given call to this function completes before making a new call.
 * @param {string|string[]} input - A string or array of strings containing FSH
 * @param {fshToFhirOptions} options - An object containing options for processing. Options include canonical, version, fhirVersion, dependencies, and logLevel
 * @returns {Promise<{fhir: any[]; errors: ErrorsAndWarnings['errors']; warnings: ErrorsAndWarnings['warnings'];}>} - Object containing generated fhir, and errors/warnings from processing
 */
export async function fshToFhir(
  input: string | string[],
  options: fshToFhirOptions = {}
): Promise<{
  fhir: any[];
  errors: ErrorsAndWarnings['errors'];
  warnings: ErrorsAndWarnings['warnings'];
}> {
  // track errors and warnings, and determine log level from options
  errorsAndWarnings.reset();
  errorsAndWarnings.shouldTrack = true;
  if (options.logLevel == 'silent') {
    logger.transports[0].silent = true;
  } else if (options.logLevel != null) {
    if (!isLevel(options.logLevel)) {
      return {
        fhir: null,
        errors: [
          {
            message: `Invalid logLevel: ${options.logLevel}. Valid levels include: ${levels.join(
              ', '
            )}.`
          }
        ],
        warnings: []
      };
    }
    logger.level = options.logLevel;
  }

  // set up a config so that sushi can run
  const config = {
    canonical: options.canonical ?? 'http://example.org',
    FSHOnly: true,
    fhirVersion: [options.fhirVersion ?? '4.0.1'],
    dependencies: options.dependencies,
    version: options.version
  };

  // load dependencies
  const defs = new FHIRDefinitions();
  await loadExternalDependencies(defs, config);

  // load FSH text into memory
  const rawFSHes: RawFSH[] = [];
  if (Array.isArray(input)) {
    input.forEach((input, i) => {
      rawFSHes.push(new RawFSH(input, `Input_${i}`));
    });
  } else {
    rawFSHes.push(new RawFSH(input));
  }
  const tank = fillTank(rawFSHes, config);

  // process FSH text into FHIR
  const outPackage = exportFHIR(tank, defs);
  const fhir: any[] = [];
  (
    [
      'profiles',
      'extensions',
      'instances',
      'valueSets',
      'codeSystems',
      'logicals',
      'resources'
    ] as const
  ).forEach(artifactType => {
    outPackage[artifactType].forEach((artifact: { toJSON: (snapshot: boolean) => any }) => {
      fhir.push(artifact.toJSON(false));
    });
  });

  return {
    fhir,
    errors: errorsAndWarnings.errors,
    warnings: errorsAndWarnings.warnings
  };
}

type fshToFhirOptions = {
  canonical?: string;
  version?: string;
  fhirVersion?: string;
  dependencies?: ImplementationGuideDependsOn[];
  logLevel?: Level;
};

// Winston levels: https://github.com/winstonjs/winston#logging-levels plus a silent option
const levels = ['silly', 'debug', 'verbose', 'http', 'info', 'warn', 'error', 'silent'] as const;
type Level = typeof levels[number];
function isLevel(level: string): level is Level {
  return levels.includes(level as Level);
}
