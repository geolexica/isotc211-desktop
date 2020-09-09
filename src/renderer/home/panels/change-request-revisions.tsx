import React, { useContext } from 'react';

import { useIPCValue } from '@riboseinc/coulomb/ipc/renderer';

import { app } from 'renderer';
import { Revision } from 'models/revisions';
import { Concept } from 'models/concepts';
import { PanelConfig } from '../panel-config';
import { ChangeRequestContext } from '../contexts';
import { refToString } from '../concepts';
import { LocalizedEntryList } from '../concepts/localized-entry-list';

import sharedStyles from '../styles.scss';
import { ChangeRequest } from 'models/change-requests';


const ChangeRequestRevisions: React.FC<{}> = function () {
  const crID = useContext(ChangeRequestContext).selected;

  const cr = app.useOne<ChangeRequest, string>('changeRequests', crID || null).object;
  const suggestedRevisions = cr?.revisions.concepts;

  return (
    <LocalizedEntryList
      itemHeight={24}
      buttonProps={{ small: true }}
      entries={Object.values(suggestedRevisions || {}).map(r => r.object)}
      itemMarker={(e: Concept<any, any>) =>
        <span className={sharedStyles.conceptID}>{e.language_code}/{e.id >= 0 ? refToString(e.id) : "NEW"}</span>}
    />
  );
};


export default {
  Contents: ChangeRequestRevisions,
  className: sharedStyles.sourceRollPanel,
  title: "Proposed revisions",
} as PanelConfig;
