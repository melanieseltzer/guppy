// @flow
import slug from 'slug';
import random from 'random-seed';
import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import { COLORS } from '../constants';
import { defaultParentPath } from '../reducers/paths.reducer';

import { formatCommandForPlatform } from './platform.service';

import { FAKE_CRA_PROJECT } from './create-project.fixtures';

import type { ProjectType } from '../types';

// Change this boolean flag to skip project creation.
// Useful when working on the flow, to avoid having to wait for a real project
// to be created every time.
const DISABLE = false;

type ProjectInfo = {
  projectName: string,
  projectType: ProjectType,
  projectIcon: string,
};

/**
 * This service manages the creation of a new project.
 * It is in charge of interfacing with the host machine to:
 *   1) Figure out if it needs to install any dependencies
 *      I'm gonna assume that installing Guppy also installs Node.
 *
 *   2) Generate the project directory, if it doesn't already exist
 *
 *   3) Using create-react-app (or Gatsby) to generate a new project
 *
 *   4) Add some custom info to package.json to make it a distinct Guppy project
 *      (probably just the 'name' so that we can avoid slug-only names?)
 *
 * TODO: Ew callbacks. I can't just use a promise, though, since it needs to
 * fire multiple times, to handle updates mid-creation. Maybe an observable?
 */
export default (
  { projectName, projectType, projectIcon }: ProjectInfo,
  onStatusUpdate: (update: string) => void,
  onError: (err: string) => void,
  onComplete: (packageJson: any) => void
) => {
  if (DISABLE) {
    onComplete(FAKE_CRA_PROJECT);
    return;
  }

  const parentPath = defaultParentPath;

  // Create the projects directory, if this is the first time creating a
  // project.
  if (!fs.existsSync(parentPath)) {
    fs.mkdirSync(parentPath);
  }

  onStatusUpdate('Created parent directory');

  const id = slug(projectName).toLowerCase();

  // For Windows Support
  // To support cross platform with slashes and escapes
  const projectPath = path.join(parentPath, id);

  const [instruction, ...args] = getBuildInstructions(projectType, projectPath);

  const process = childProcess.spawn(instruction, args);

  process.stdout.on('data', onStatusUpdate);
  process.stderr.on('data', onError);

  // TODO: This code could be a lot nicer.
  // Maybe promisify some of these callback APIs to avoid callback hell?
  process.on('close', () => {
    onStatusUpdate('Dependencies installed');

    fs.readFile(path.join(projectPath, 'package.json'), 'utf8', (err, data) => {
      if (err) {
        return console.error(err);
      }

      const packageJson = JSON.parse(data);

      packageJson.guppy = {
        id,
        name: projectName,
        type: projectType,
        icon: projectIcon,
        // The project color is currently unused for freshly-created projects,
        // however it's used for imported non-guppy projects, and it seems like
        // a good thing to be consistent about (may be useful in other ways).
        color: getColorForProject(projectName),
        createdAt: Date.now(),
      };

      const prettyPrintedPackageJson = JSON.stringify(packageJson, null, 2);

      fs.writeFile(
        path.join(projectPath, 'package.json'),
        prettyPrintedPackageJson,
        err => {
          if (err) {
            return console.error(err);
          }
          onComplete(packageJson);
        }
      );
    });
  });
};

// Exported so that getColorForProject can be tested
export const possibleProjectColors = [
  COLORS.hotPink[700],
  COLORS.pink[700],
  COLORS.red[700],
  COLORS.orange[700],
  COLORS.green[700],
  COLORS.teal[700],
  COLORS.violet[700],
  COLORS.purple[700],
];

export const getColorForProject = (projectName: string) => {
  const projectColorIndex = random
    .create(projectName)
    .range(possibleProjectColors.length);

  return possibleProjectColors[projectColorIndex];
};

export const getBuildInstructions = (
  projectType: ProjectType,
  path: string
) => {
  // For Windows Support
  // Windows tries to run command as a script rather than on a cmd
  // To force it we add *.cmd to the commands
  const command = formatCommandForPlatform('npx');
  switch (projectType) {
    case 'create-react-app':
      return [command, 'create-react-app', path];
    case 'gatsby':
      return [command, 'gatsby', 'new', path];
    default:
      throw new Error('Unrecognized project type: ' + projectType);
  }
};
