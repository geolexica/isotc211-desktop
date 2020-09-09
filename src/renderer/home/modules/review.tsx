import moment from 'moment';
import { shell } from 'electron';
import * as log from 'electron-log';
import React, { useContext, useEffect, useState } from 'react';
import VisualDiff from 'react-visual-diff';

import {
  NonIdealState, Icon, Callout, FormGroup,
  InputGroup, Button, ButtonGroup, NumericInput,
} from '@blueprintjs/core';

import { useIPCValue, callIPC } from '@riboseinc/coulomb/ipc/renderer';
import { LangConfigContext } from '@riboseinc/coulomb/localizer/renderer/context';

import {
  Concept, MultiLanguageConcept,
  SupportedLanguages, LifecycleStage, ConceptRef,
} from 'models/concepts';
import { ChangeRequest, RevisionInCR } from 'models/change-requests';
import { getNewRevisionID } from 'models/revisions';
import { app } from 'renderer';
import { useHelp } from 'renderer/help';
import * as panels from '../panels';
import { ModuleConfig, ToolbarItem } from '../module-config';
import { ConceptContext, SourceContext, ChangeRequestContext, UserRoleContext, ModuleContext } from '../contexts';
import { EntryDetails } from '../concepts';
import sharedStyles from '../styles.scss';
import styles from './review.scss';
import { PanelConfig } from '../panel-config';
import { AnnotatedChange } from '../inline-diff';


type ConceptRevision = RevisionInCR<Concept<any, any>>;


const InlineDiff: React.FC<{
  proposedRevision: Concept<any, any> | null
  proposedRevisionTimestamp: Date | null
  comparedRevision: Concept<any, any> | null
  comparedRevisionID: string | null
}> = React.memo(({ proposedRevision, comparedRevision }) => {
  const proposedEntry = proposedRevision ? <EntryDetails entry={proposedRevision} /> : <></>;
  return <VisualDiff
    left={comparedRevision ? <EntryDetails entry={comparedRevision} /> : proposedEntry}
    right={proposedEntry}
    renderChange={AnnotatedChange} />;
}, (prevProps, nextProps) =>
  prevProps.proposedRevisionTimestamp === nextProps.proposedRevisionTimestamp &&
  prevProps.comparedRevisionID === nextProps.comparedRevisionID
);


const MainView: React.FC<{}> = function () {
  const source = useContext(SourceContext);
  const ctx = useContext(ConceptContext);
  const crCtx = useContext(ChangeRequestContext);
  const lang = useContext(LangConfigContext);
  const crID = crCtx.selected;
  const crObjectID = crCtx.selectedItem;
  const mod = useContext(ModuleContext);

  const reviewMaterial = useIPCValue
  <{ changeRequestID: string | null, objectType: string, objectID: string | null }, { toReview?: ConceptRevision }>
  ('model-changeRequests-read-revision', {}, { changeRequestID: crID, objectType: 'concepts', objectID: crObjectID }).value;

  const revisionToReview = reviewMaterial.toReview || null;
  const revisionToCompare = ctx.revision;

  useEffect(() => {
    if (reviewMaterial.toReview) {
      lang.select(reviewMaterial.toReview.object.language_code);
      ctx.select(reviewMaterial.toReview.object.id);
      if (reviewMaterial.toReview.parents.length > 0) {
        ctx.selectRevision(reviewMaterial.toReview.parents[0]);
      } else {
        ctx.selectRevision(null);
      }
      //selectComparableRevision();
    } else {
      //ctx.select(null);
    }
  }, [reviewMaterial.toReview]);

  if (crID === null) {
    return <NonIdealState
      title="No change request is selected"
      description={source.active.type !== 'change-request' ? <>
        <Callout intent="primary">
          Select a pending change request on the left.
        </Callout>
      </> : undefined}
    />;

  } else if (revisionToReview === null) {
    return <NonIdealState
      title="Nothing to show"
      description={<>
        Please select a proposed revision on the left,<br />
        or add a revision to this CR via Edit or Translate.
      </>} />;
  }

  const compare: false | 'inline-diff' = mod.opts.compare !== undefined ? mod.opts.compare : 'inline-diff';

  return (
    <div className={sharedStyles.backdrop}>
      <div className={styles.reviewForm}>
        {compare === 'inline-diff'
          ? <InlineDiff
              proposedRevision={revisionToReview.object}
              proposedRevisionTimestamp={revisionToReview.timeCreated}
              comparedRevision={revisionToCompare}
              comparedRevisionID={ctx.revisionID} />
          : <EntryDetails entry={revisionToReview.object} />}
      </div>
    </div>
  );
};


const SuggestedRevisionPanel: React.FC<{}> = function () {
  const ctx = useContext(ConceptContext);
  const crCtx = useContext(ChangeRequestContext);
  const lang = useContext(LangConfigContext);

  const [commitInProgress, setCommitInProgress] = useState<boolean>(false);

  const [newItemID, setNewItemID] = useState<number | undefined>(undefined);
  const [newItemIDIsAvailable, setNewItemIDIsAvailable] = useState<boolean | undefined>(undefined);

  const userIsManager = useContext(UserRoleContext).isManager === true;

  const committerInfo = useIPCValue<{}, { email: string, name: string }>
  ('db-default-get-current-committer-info', { email: '', name: '' }).value;

  const crID = crCtx.selected;
  const crObjectID = crCtx.selectedItem;

  useEffect(() => {
    setNewItemID(undefined);
  }, [crObjectID]);

  useEffect(() => {
    (async () => {
      if (newItemID !== undefined) {
        try {
          const available = (
            await callIPC<{ objectID: number | null }, { object: MultiLanguageConcept<any> | null }>
            ('model-concepts-read-one', { objectID: newItemID })
          ).object === null;
          setNewItemIDIsAvailable(available);
        } catch (e) {
          setNewItemIDIsAvailable(true);
        }
      }
    })();
  }, [newItemID]);

  const cr = app.useOne<ChangeRequest, string>('changeRequests', crID || null).object;
  const crIsUnderReview = cr ? (cr.timeSubmitted !== undefined && cr.timeResolved === undefined) : undefined;
  const crIsEditableDraft = cr && cr.timeSubmitted === undefined && cr.author.email === committerInfo.email;

  const _reviewMaterial = useIPCValue
  <{ changeRequestID: string | null, objectType: string, objectID: string | null }, { toReview?: ConceptRevision }>
  ('model-changeRequests-read-revision', {}, { changeRequestID: crID, objectType: 'concepts', objectID: crObjectID });

  const reviewMaterial = _reviewMaterial.value;

  const revisionToReview = reviewMaterial.toReview || null;

  const _original = app.useOne<MultiLanguageConcept<any>, number>
  ('concepts', revisionToReview ? revisionToReview.object.id : null).object;

  if (!revisionToReview || !crObjectID) {
    return null;
  }

  const original = _original ? _original[revisionToReview.object.language_code as keyof SupportedLanguages] : null;

  const suggestedRevisionParent = revisionToReview.parents.length > 0 ? revisionToReview.parents[0] : null;
  const suggestedRevisionIsNewEntry = suggestedRevisionParent === null;

  let suggestedRevisionWasAccepted: boolean;
  let suggestedRevisionWasAcceptedAndIsCurrent: boolean | undefined;
  if (original && Object.values(original._revisions.tree).find(rev => rev.changeRequestID === crID) !== undefined) {
    // If data item has a revision referencing the ID of the CR containing this suggested revision,
    // then consider this suggested revision accepted.
    suggestedRevisionWasAccepted = true;
    suggestedRevisionWasAcceptedAndIsCurrent = original._revisions.tree[original._revisions.current].changeRequestID === crID;
  } else if (suggestedRevisionIsNewEntry && revisionToReview.createdObjectID !== undefined) {
    suggestedRevisionWasAccepted = true;
    suggestedRevisionWasAcceptedAndIsCurrent = true;
  } else {
    suggestedRevisionWasAccepted = false;
    suggestedRevisionWasAcceptedAndIsCurrent = undefined;
  }
  const suggestedRevisionNeedsRebase = original
    ? (suggestedRevisionWasAccepted === false && suggestedRevisionParent !== null && suggestedRevisionParent !== original._revisions.current)
    : undefined;

  async function deleteRevision() {
    if (crIsEditableDraft !== true || crID === null || crObjectID === null) {
      return;
    }

    setCommitInProgress(true);

    await callIPC<{ changeRequestID: string, objectType: string, objectID: string }, { success: true }>
    ('model-changeRequests-delete-revision', {
      changeRequestID: crID,
      objectType: 'concepts',
      objectID: crObjectID,
    });

    _reviewMaterial.refresh();

    setCommitInProgress(false);
  }

  async function applyRevision() {
    if (revisionToReview === null || commitInProgress || !crID) {
      log.error("Cannot apply revision: No revision to review");
      throw new Error("Cannot apply revision: No revision to review");
    }

    setCommitInProgress(true);

    const parent = suggestedRevisionParent;

    let newRevisionID: string;

    if (suggestedRevisionIsNewEntry && _original === null && newItemID !== undefined && newItemID > 0 && crObjectID !== null) {
      newRevisionID = getNewRevisionID();
      const newConceptID: number = newItemID;
      const reviewedRevision: ConceptRevision = {
        ...revisionToReview,
        object: {
          ...revisionToReview.object,
          id: newConceptID,
        }
      };
      await callIPC<
        { object: MultiLanguageConcept<any>, commit: boolean },
        { newRevisionID: string }
      >('model-concepts-create-one', {
        commit: true,
        object: {
          termid: newConceptID,
          eng: {
            ...reviewedRevision.object,
            id: newConceptID,
            _revisions: {
              current: newRevisionID,
              tree: {
                [newRevisionID]: {
                  ...reviewedRevision,
                  changeRequestID: crID,
                  author: committerInfo,
                },
              },
            },
          },
        },
      });

      await callIPC<
        { changeRequestID: string, objectType: string, objectID: string, createdObjectID: ConceptRef },
        { success: boolean }
      >('model-changeRequests-mark-revision-as-accepted', {
        changeRequestID: crID,
        objectType: 'concepts',
        objectID: crObjectID,
        createdObjectID: newConceptID,
      });

    } else if (_original && crObjectID !== null) {
      const result = await callIPC<
        { objID: ConceptRef, data: Concept<any, any>, lang: keyof SupportedLanguages, parentRevision: string | null, changeRequestID?: string },
        { newRevisionID: string }
      >('model-concepts-create-revision', {
        objID: _original.termid,
        data: revisionToReview.object,
        lang: revisionToReview.object.language_code,
        changeRequestID: crID,
        parentRevision: parent,
      });

      newRevisionID = result.newRevisionID;

      await callIPC<
        { changeRequestID: string, objectType: string, objectID: string, createdRevisionID: string },
        { success: boolean }
      >('model-changeRequests-mark-revision-as-accepted', {
        changeRequestID: crID,
        objectType: 'concepts',
        objectID: crObjectID,
        createdRevisionID: newRevisionID,
      });

    } else {
      log.error("Cannot apply revision: Required info is missing");
      throw new Error("Cannot apply revision");
    }

    _reviewMaterial.refresh();

    setCommitInProgress(false);
  }

  let acceptHelperText: undefined | string;
  if (suggestedRevisionWasAccepted) {
    acceptHelperText = `This revision was accepted, and is ${suggestedRevisionWasAcceptedAndIsCurrent ? 'current' : 'no longer current'}.`;
  } else if (suggestedRevisionNeedsRebase) {
    acceptHelperText = `Between the moment this change was proposed and now, a new revision of the original item was created.`;
  } else if (crIsUnderReview === false) {
    acceptHelperText = 'This change request is not under review, hence this change cannot be accepted.';
  } else if (cr && original) {
    if (suggestedRevisionIsNewEntry) {
      acceptHelperText = 'Add this revision as a new item.';
    } else {
      acceptHelperText = 'Add this revision to original item.';
    }
  } else {
    acceptHelperText = undefined;
  }

  return (
    <>
      {crIsUnderReview
        ? <>
            {suggestedRevisionIsNewEntry === true
              ? <FormGroup label="New&nbsp;item&nbsp;ID" intent="primary">
                  <NumericInput
                    width={10}
                    rightElement={
                      (_original === null && !suggestedRevisionWasAccepted)
                        ? <Button
                            minimal
                            intent={(newItemID !== undefined && newItemIDIsAvailable) ? "success" : "danger"}
                            icon={(newItemID !== undefined && newItemIDIsAvailable) ? "tick" : "warning-sign"} />
                        : undefined
                    }
                    onValueChange={(num) => setNewItemID(num || undefined)}
                    disabled={_original !== null || suggestedRevisionWasAccepted}
                    value={_original?.termid || revisionToReview.createdObjectID || newItemID || 0} />
                </FormGroup>
              : <FormGroup label="Item&nbsp;ID" inline>
                  <InputGroup disabled value={original?.id} />
                </FormGroup>
            }
          </>
        : null}
      {suggestedRevisionIsNewEntry !== true
        ? <FormGroup label="Supersedes&nbsp;revision" inline>
            <InputGroup
              rightElement={
                <Button
                  minimal
                  intent="primary"
                  onClick={() => {
                    ctx.selectRevision(revisionToReview.parents[0]);
                    lang.select(revisionToReview.object.language_code);
                  }}
                  icon="locate"
                  title="Locate and select parent revision as comparison target."
                />
              }
              disabled
              type="text"
              value={revisionToReview.parents[0]} />
          </FormGroup>
        : null
      }
      {crIsEditableDraft
        ? <FormGroup
              helperText="Delete revision if you don’t want to propose this change. You cannot do this after you submit the CR."
              inline>
            <Button
                fill
                onClick={deleteRevision}
                disabled={commitInProgress}
                loading={commitInProgress}>
              Delete revision
            </Button>
          </FormGroup>
        : <FormGroup
              intent={suggestedRevisionNeedsRebase ? 'warning' : undefined}
              helperText={acceptHelperText}
              inline>
            <Button
                fill
                intent={suggestedRevisionNeedsRebase ? "warning" : "primary"}
                icon={suggestedRevisionWasAccepted ? 'tick-circle' : 'confirm'}
                rightIcon={(suggestedRevisionWasAccepted === false && suggestedRevisionNeedsRebase === true) ? 'warning-sign' : undefined}
                loading={commitInProgress}
                disabled={
                  !userIsManager ||
                  commitInProgress ||
                  crIsUnderReview !== true ||
                  suggestedRevisionWasAccepted ||
                  suggestedRevisionNeedsRebase ||
                  (!suggestedRevisionIsNewEntry && !original && !_original) ||
                  (suggestedRevisionIsNewEntry && !_original && newItemID === undefined)}
                onClick={applyRevision}>
              Accept revision
            </Button>
          </FormGroup>}
    </>
  );
};
const suggestedRevision: PanelConfig = {
  Contents: SuggestedRevisionPanel,
  title: "Proposed revision",
};


const CRDetailsPanel: React.FC<{}> = function () {
  const committerEmail = useIPCValue<{}, { email: string }>
  ('db-default-get-current-committer-info', { email: '' }).value.email;

  const crCtx = useContext(ChangeRequestContext);
  const crID = crCtx.selected;

  const cr = app.useOne<ChangeRequest, string>('changeRequests', crID || null).object;

  const [stageInProgress, setStageInProgress] = useState<boolean>(false);

  const ctx = useContext(ConceptContext);
  const userIsManager = useContext(UserRoleContext).isManager === true;

  const revealButtonHelpRef = useHelp('file-reveal-button');

  async function getFilesystemPath(crID: string): Promise<string> {
    return (await callIPC<{ objectID: string }, { path: string }>
    ('model-changeRequests-get-filesystem-path', { objectID: crID })).path;
  }

  if (!crID || !cr) {
    return null;
  }

  const isInReview = cr.timeSubmitted !== undefined && cr.timeResolved === undefined;
  const isResolved = cr.timeResolved !== undefined;
  const isDraft = !isInReview && !isResolved;

  const crHasRevisions = Object.values(cr.revisions).
    find(objectTypeChanges => Object.keys(objectTypeChanges).length > 0);

  async function updateStage(newStage: LifecycleStage) {
    if (crID === null || stageInProgress) {
      return;
    }

    setStageInProgress(true);

    await callIPC<{ changeRequestID: string, newStage: LifecycleStage }, { success: true }>
    ('model-changeRequests-update-stage', { changeRequestID: crID, newStage });

    setStageInProgress(false);

    ctx.select(null);
    crCtx.select(null);
  }

  return (
    <>
      <FormGroup label="ID" inline>
        <InputGroup
          disabled
          type="text"
          value={crID || '—'} />
      </FormGroup>

      {isDraft
        ? <FormGroup label="Created" inline>
            <InputGroup
              disabled
              type="text"
              value={moment(cr.timeCreated).toLocaleString()} />
          </FormGroup>
        : null}

      {isResolved
        ? <FormGroup label="Resolved" inline>
            <InputGroup
              disabled
              type="text"
              value={moment(cr.timeResolved).toLocaleString()} />
          </FormGroup>
        : null}

      {isInReview || isResolved
        ? <FormGroup label="Proposed" inline>
            <InputGroup
              disabled
              type="text"
              value={moment(cr.timeSubmitted).toLocaleString()} />
          </FormGroup>
        : null}

      <FormGroup label="Stage" inline helperText={
        <ButtonGroup vertical fill>
          {cr.author.email === committerEmail && isDraft
            ? <Button small disabled={stageInProgress || !crHasRevisions} intent="success" onClick={async () => await updateStage('Proposal')}>Propose</Button>
            : null}
          {isInReview && userIsManager
            ? <>
                <Button small disabled={stageInProgress} intent="success" onClick={async () => await updateStage('Resolved')}>Resolve</Button>
                <Button small disabled={stageInProgress} intent="danger" onClick={async () => await updateStage('Rejected')}>Reject</Button>
              </>
            : null}
          {cr.author.email === committerEmail && isInReview
            ? <Button outlined small disabled={stageInProgress} intent="warning" onClick={async () => await updateStage('Withdrawn')}>Withdraw</Button>
            : null}
        </ButtonGroup>
      }>
        <InputGroup
          readOnly
          type="text"
          value={cr.meta.registry.stage || '—'} />
      </FormGroup>
      <FormGroup label="File" inline={true}>
        <Button
          minimal
          elementRef={revealButtonHelpRef}
          disabled={crID === null}
          onClick={async () => crID !== null
            ? shell.showItemInFolder(await getFilesystemPath(crID))
            : void 0}>reveal</Button>
      </FormGroup>
    </>
  );
};
const CRDetailsTitleSecondary: React.FC<{ isCollapsed?: boolean }> = function ({ isCollapsed }) {
  const crID = useContext(ChangeRequestContext).selected;
  return isCollapsed ? <div>ID: {`${crID}`}</div> : null;
}
const crDetails: PanelConfig = {
  Contents: CRDetailsPanel,
  title: "Change request",
  TitleComponentSecondary: CRDetailsTitleSecondary,
};


const CompareSwitch: ToolbarItem = function () {
  const modCtx = useContext(ModuleContext);

  const compare: false | 'inline-diff' | 'side-by-side' =
    modCtx.opts.compare !== undefined ? modCtx.opts.compare : 'inline-diff';

  return (
    <ButtonGroup>
      <Button
        icon="document"
        title="Item as proposed without comparison"
        active={compare === false}
        onClick={() => { modCtx.setOpts({ ...modCtx.opts, compare: false }); }} />
      <Button
        icon="highlight"
        title="Item as proposed, differences with comparison target highlighted"
        active={compare === 'inline-diff'}
        onClick={() => { modCtx.setOpts({ ...modCtx.opts, compare: 'inline-diff' }); }} />
      <Button
        icon="comparison"
        disabled
        title="Side-by-side comparison between item as proposed and comparison target"
        active={compare === 'side-by-side'}
        onClick={() => { modCtx.setOpts({ ...modCtx.opts, compare: 'side-by-side' }); }} />
    </ButtonGroup>
  );
};


export default {
  hotkey: 'x',
  title: "Review",

  leftSidebar: [
    crDetails,
    panels.changeRequestRevisions,
    panels.changeRequests,
    panels.help,
  ],

  MainView: MainView,
  mainToolbar: [CompareSwitch],

  rightSidebar: [
    suggestedRevision,
    { className: sharedStyles.flexiblePanelSeparator,
      Contents: () => <span><Icon icon="chevron-down" />{" "}Comparison target</span>,
      collapsed: 'never' },
    { ...panels.languages, collapsed: 'by-default' },
    panels.lineage,
    panels.revision,
  ],
} as ModuleConfig;
