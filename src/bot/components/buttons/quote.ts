import createComponent from '../../../helpers/component';
import { InteractableComponentType } from '../../../types/types';
import { handleQuoteAction } from '../../../utils/quote';

createComponent({
  type: InteractableComponentType.Button,
  custom_id: 'quote-action',
  args: ['session_id', 'action'] as const,
  acknowledge: true,
  async run(interaction, args, api) {
    const { session_id, action } = args;

    await handleQuoteAction(interaction, session_id, action, api);
  },
});
