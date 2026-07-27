import createComponent from '../../../helpers/component.js';
import { InteractableComponentType } from '../../../types/types.js';
import { handleQuoteAction } from '../../../utils/quote.js';

createComponent({
  type: InteractableComponentType.Button,
  custom_id: 'quote-action',
  args: ['session_id', 'action'] as const,
  acknowledge: true,
  async run(interaction, args, api) {
    await handleQuoteAction(interaction, args.session_id, args.action, api);
  },
});
