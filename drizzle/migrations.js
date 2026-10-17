// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

import journal from './meta/_journal.json';
import m0000 from './0000_cheerful_wrecking_crew.sql';
import m0001 from './0001_right_jasper_sitwell.sql';
import m0002 from './0002_curvy_scream.sql';
import m0003 from './0003_careful_silhouette.sql';
import m0004 from './0004_fair_sparrow.sql';
import m0005 from './0005_messy_network.sql';

export default {
  journal,
  migrations: {
    m0000,
    m0001,
    m0002,
    m0003,
    m0004,
    m0005,
  },
};
