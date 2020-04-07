import React, { useContext } from 'react';
import { LangConfigContext } from 'coulomb/localizer/renderer/context';
import { Classes, FormGroup, InputGroup, Text } from '@blueprintjs/core';
import { PanelConfig } from '../panel-config';
import { ConceptContext } from '../contexts';
import sharedStyles from '../styles.scss';
import styles from './basics.scss';
import { panelFieldProps } from './common';
import { getRepresentingDesignation } from '../concepts/designation';
import MathJax from 'react-mathjax2';


const Panel: React.FC<{}> = function () {
  const lang = useContext(LangConfigContext);
  const concept = useContext(ConceptContext);
  const localized = concept.activeLocalized;
  const revision = concept.revision;
  const field = panelFieldProps(concept);
  const rtlClass = lang.selected === 'ara' ? Classes.RTL : '';

  const isValid = revision ? ['retired', 'superseded'].indexOf(revision.entry_status) < 0 : undefined;
  const designationValidityClass = isValid === false ? sharedStyles.invalidDesignation : '';
  const loadingClass = concept.isLoading ? Classes.SKELETON : undefined;
  const preferredDesignationMarker = localized?.terms[0].normativeStatus === 'preferred'
    ? <span className={loadingClass}>preferred</span>
    : undefined;

  return (
    <div className={`${styles.panelBase} ${rtlClass}`}>
      {revision !== null
        ? <>
            <FormGroup
                key="designation"
                label="Designation"
                labelInfo={preferredDesignationMarker}
                className={styles.designation}>
              <InputGroup
                large={true}
                value={getRepresentingDesignation(revision)}
                className={`${rtlClass} ${designationValidityClass} ${loadingClass}`}
                {...field} />
            </FormGroup>

            <FormGroup
                className={rtlClass}
                key="definition">
              <div className={`${styles.definition} ${rtlClass} ${loadingClass}`}>
                <MathJax.Text text={revision.definition || ''} />
              </div>
            </FormGroup>

            <div className={styles.notesAndExamples}>
              {[...revision.notes.entries()].map(([idx, note]) =>
                <FormGroup
                    key={`note-${idx}`}
                    inline
                    label="NOTE">
                  <Text className={`${styles.note} ${loadingClass}`}>
                    <MathJax.Text text={note} />
                  </Text>
                </FormGroup>
              )}

              {[...revision.examples.entries()].map(([idx, example]) =>
                <FormGroup
                    key={`note-${idx}`}
                    inline
                    label="EXAMPLE">
                  <Text className={`${loadingClass} ${styles.example}`}>
                    <MathJax.Text text={example} />
                  </Text>
                </FormGroup>
              )}
            </div>
          </>

        : null}
    </div>
  );
};


export default {
  Contents: Panel,
  title: "Basics",
} as PanelConfig;